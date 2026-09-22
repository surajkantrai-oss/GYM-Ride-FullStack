import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/types/auth-user';

interface AccessClaims extends AuthUser {
  sub: string;
  tokenType: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }
  validate(payload: AccessClaims): AuthUser {
    if (
      payload.tokenType !== 'access' ||
      !payload.sub ||
      !Array.isArray(payload.roles) ||
      !payload.sessionId
    )
      throw new UnauthorizedException('Invalid access token');
    return { id: payload.sub, roles: payload.roles, sessionId: payload.sessionId };
  }
}
