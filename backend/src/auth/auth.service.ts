import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName, UserStatus } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { OtpService } from './otp.service';

interface TokenClaims {
  sub: string;
  roles: RoleName[];
  sessionId: string;
  tokenType: 'access' | 'refresh';
}
interface SessionContext {
  deviceName?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  requestOtp(phone: string, ip: string): ReturnType<OtpService['request']> {
    return this.otp.request(phone, ip);
  }

  async verifyOtp(phoneInput: string, otp: string, context: SessionContext): Promise<unknown> {
    const phone = await this.otp.verify(phoneInput, otp);
    const customerRole = await this.prisma.role.findUnique({
      where: { name: RoleName.CUSTOMER },
    });
    if (!customerRole)
      throw new DomainException(
        ApiErrorCode.INTERNAL_ERROR,
        'Customer role is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    const user = await this.prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone, status: UserStatus.ACTIVE, roles: { create: { roleId: customerRole.id } } },
      include: { roles: { include: { role: true } } },
    });
    if (user.status !== UserStatus.ACTIVE)
      throw new DomainException(
        ApiErrorCode.FORBIDDEN,
        'Account is not active',
        HttpStatus.FORBIDDEN,
      );
    const roles = user.roles.map(({ role }) => role.name);
    const tokens = await this.createSession(user.id, roles, context);
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        email: user.email,
        roles,
      },
      tokens,
    };
  }

  async refresh(rawToken: string): Promise<unknown> {
    const claims = await this.verifyRefresh(rawToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: claims.sessionId },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    if (!session || session.userId !== claims.sub) this.invalidRefresh();
    if (session.revokedAt)
      throw new DomainException(
        ApiErrorCode.SESSION_REVOKED,
        'Session has been revoked',
        HttpStatus.UNAUTHORIZED,
      );
    if (session.expiresAt <= new Date())
      throw new DomainException(
        ApiErrorCode.REFRESH_TOKEN_EXPIRED,
        'Refresh token expired',
        HttpStatus.UNAUTHORIZED,
      );
    if (!this.hashMatches(session.tokenHash, rawToken)) {
      await this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new DomainException(
        ApiErrorCode.SESSION_REVOKED,
        'Refresh token reuse detected',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const roles = session.user.roles.map(({ role }) => role.name);
    const tokens = await this.issueTokens(session.userId, roles, session.id);
    const updated = await this.prisma.refreshSession.updateMany({
      where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
      data: { tokenHash: this.hash(tokens.refreshToken), expiresAt: tokens.refreshExpiresAt },
    });
    if (updated.count !== 1)
      throw new DomainException(
        ApiErrorCode.SESSION_REVOKED,
        'Session was already rotated',
        HttpStatus.UNAUTHORIZED,
      );
    return {
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresIn: this.accessTtl,
      },
    };
  }

  async logout(user: AuthUser): Promise<{ message: string }> {
    await this.prisma.$transaction([
      this.prisma.refreshSession.updateMany({
        where: { id: user.sessionId, userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.pushDevice.updateMany({ where: { userId: user.id, sessionId: user.sessionId }, data: { enabled: false } }),
    ]);
    return { message: 'Logged out' };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.prisma.$transaction([
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.pushDevice.updateMany({ where: { userId }, data: { enabled: false } }),
    ]);
    return { message: 'Logged out from all devices' };
  }

  private async createSession(
    userId: string,
    roles: RoleName[],
    context: SessionContext,
  ): Promise<{ accessToken: string; refreshToken: string; accessTokenExpiresIn: number }> {
    const sessionId = randomUUID();
    const tokens = await this.issueTokens(userId, roles, sessionId);
    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: this.hash(tokens.refreshToken),
        expiresAt: tokens.refreshExpiresAt,
        deviceName: context.deviceName,
        userAgent: context.userAgent?.slice(0, 500),
      },
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresIn: this.accessTtl,
    };
  }

  private async issueTokens(
    userId: string,
    roles: RoleName[],
    sessionId: string,
  ): Promise<{ accessToken: string; refreshToken: string; refreshExpiresAt: Date }> {
    const accessClaims: TokenClaims = { sub: userId, roles, sessionId, tokenType: 'access' };
    const refreshClaims: TokenClaims = { ...accessClaims, tokenType: 'refresh' };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessClaims, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessTtl,
      }),
      this.jwt.signAsync(refreshClaims, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.refreshTtl,
      }),
    ]);
    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: new Date(Date.now() + this.refreshTtl * 1000),
    };
  }

  private async verifyRefresh(token: string): Promise<TokenClaims> {
    try {
      const claims = await this.jwt.verifyAsync<TokenClaims>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (claims.tokenType !== 'refresh') this.invalidRefresh();
      return claims;
    } catch {
      this.invalidRefresh();
    }
  }
  private invalidRefresh(): never {
    throw new DomainException(
      ApiErrorCode.INVALID_REFRESH_TOKEN,
      'Invalid refresh token',
      HttpStatus.UNAUTHORIZED,
    );
  }
  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
  private hashMatches(expected: string, value: string): boolean {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(this.hash(value)));
  }
  private get accessTtl(): number {
    return this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
  }
  private get refreshTtl(): number {
    return this.config.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS');
  }
}
