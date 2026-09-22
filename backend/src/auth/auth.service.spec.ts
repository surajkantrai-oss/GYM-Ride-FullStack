import { ConfigService } from '@nestjs/config';
import { RoleName, UserStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const values: Record<string, unknown> = {
    JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
    JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters',
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 2592000,
  };
  const config = { getOrThrow: (key: string) => values[key] } as ConfigService;
  const user = {
    id: '79ef925d-3a40-46ea-9a15-d0ea0b75988f',
    firstName: null,
    lastName: null,
    phone: '+919876543210',
    email: null,
    status: UserStatus.ACTIVE,
    roles: [{ role: { name: RoleName.CUSTOMER } }],
  };

  it('creates only a CUSTOMER for a new public OTP login', async () => {
    const prisma = {
      user: {
        upsert: jest.fn().mockResolvedValue(user),
      },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-role' }) },
      refreshSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValueOnce('access').mockResolvedValueOnce('refresh'),
    };
    const auth = new AuthService(
      prisma as never,
      { verify: jest.fn().mockResolvedValue(user.phone) } as never,
      jwt as never,
      config,
    );
    const result = await auth.verifyOtp(user.phone, '123456', {});
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: UserStatus.ACTIVE,
          roles: { create: { roleId: 'customer-role' } },
        }),
      }),
    );
    expect(result).toMatchObject({
      user: { roles: [RoleName.CUSTOMER] },
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
    });
  });

  it('rotates a valid refresh token atomically', async () => {
    const old = 'old-refresh';
    const hash = createHash('sha256').update(old).digest('hex');
    const prisma = {
      refreshSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session',
          userId: user.id,
          tokenHash: hash,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 10000),
          user,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: user.id,
        sessionId: 'session',
        roles: [RoleName.CUSTOMER],
        tokenType: 'refresh',
      }),
      signAsync: jest.fn().mockResolvedValueOnce('new-access').mockResolvedValueOnce('new-refresh'),
    };
    const auth = new AuthService(prisma as never, {} as never, jwt as never, config);
    await expect(auth.refresh(old)).resolves.toMatchObject({
      tokens: { refreshToken: 'new-refresh' },
    });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tokenHash: hash }) }),
    );
  });

  it('revokes a session when an old refresh token is reused', async () => {
    const prisma = {
      refreshSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session',
          userId: user.id,
          tokenHash: createHash('sha256').update('newer-token').digest('hex'),
          revokedAt: null,
          expiresAt: new Date(Date.now() + 10000),
          user,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: user.id,
        sessionId: 'session',
        roles: [RoleName.CUSTOMER],
        tokenType: 'refresh',
      }),
    };
    const auth = new AuthService(prisma as never, {} as never, jwt as never, config);
    await expect(auth.refresh('old-token')).rejects.toThrow('reuse detected');
    expect(prisma.refreshSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
  });

  it.each([
    [{ revokedAt: new Date(), expiresAt: new Date(Date.now() + 10_000) }, 'revoked'],
    [{ revokedAt: null, expiresAt: new Date(Date.now() - 10_000) }, 'expired'],
  ])('rejects a %s refresh session', async (state, message) => {
    const token = 'refresh';
    const prisma = {
      refreshSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session',
          userId: user.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          user,
          ...state,
        }),
      },
    };
    const jwt = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: user.id, sessionId: 'session', tokenType: 'refresh' }),
    };
    const auth = new AuthService(prisma as never, {} as never, jwt as never, config);
    await expect(auth.refresh(token)).rejects.toThrow(message);
  });

  it('revokes one session or all user sessions on logout', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const disableDevices = jest.fn().mockResolvedValue({ count: 1 });
    const auth = new AuthService(
      { refreshSession: { updateMany }, pushDevice: { updateMany: disableDevices }, $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)) } as never,
      {} as never,
      {} as never,
      config,
    );
    await auth.logout({ id: user.id, roles: [RoleName.CUSTOMER], sessionId: 'session' });
    await auth.logoutAll(user.id);
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'session', userId: user.id }),
      }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { userId: user.id, revokedAt: null } }),
    );
    expect(disableDevices).toHaveBeenNthCalledWith(1, { where: { userId: user.id, sessionId: 'session' }, data: { enabled: false } });
    expect(disableDevices).toHaveBeenNthCalledWith(2, { where: { userId: user.id }, data: { enabled: false } });
  });
});
