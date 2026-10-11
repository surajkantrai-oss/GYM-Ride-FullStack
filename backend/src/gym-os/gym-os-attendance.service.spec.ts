import { createHash } from 'node:crypto';
import { RoleName } from '@prisma/client';
import { GymOsAttendanceService } from './gym-os-attendance.service';

describe('GymOsAttendanceService rotating QR', () => {
  const user = { id: 'owner', roles: [RoleName.GYM_OWNER], sessionId: 'session' };

  function service(prisma: Record<string, unknown>) {
    return new GymOsAttendanceService(
      prisma as never,
      { assertBranchCheckIn: jest.fn().mockResolvedValue({ id: 'branch', gymId: 'gym' }) } as never,
      {
        getEffectiveEntitlements: jest
          .fn()
          .mockResolvedValue({ subscribed: true, features: ['ATTENDANCE'] }),
      } as never,
      { reconcile: jest.fn() } as never,
      { get: jest.fn((_key: string, fallback: number) => fallback) } as never,
    );
  }

  it('returns a branch-scoped expiring token while persisting only its hash', async () => {
    const create = jest.fn(
      ({
        data,
      }: {
        data: { gymId: string; branchId: string; tokenHash: string; expiresAt: Date };
      }) => ({
        id: '11111111-1111-4111-8111-111111111111',
        ...data,
      }),
    );
    const value = await service({ gymOsAttendanceQrToken: { create } }).qrToken(
      user,
      'gym',
      'branch',
    );
    expect(value.token).toMatch(/^11111111-1111-4111-8111-111111111111\./);
    expect(value.branchId).toBe('branch');
    expect(value.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const secret = value.token.split('.')[1]!;
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gymId: 'gym',
        branchId: 'branch',
        tokenHash: createHash('sha256').update(secret).digest('hex'),
      }),
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain(secret);
  });

  it('rejects an expired scanned token before resolving a member', async () => {
    const secret = 'a'.repeat(43);
    const findFirst = jest.fn();
    const attendance = service({
      gymOsAttendanceQrToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'token',
          gymId: 'gym',
          branchId: 'branch',
          status: 'ACTIVE',
          tokenHash: createHash('sha256').update(secret).digest('hex'),
          expiresAt: new Date(Date.now() - 1000),
        }),
      },
      gymMember: { findFirst },
    });
    await expect(attendance.customerQrCheckIn(user, `token.${secret}`)).rejects.toMatchObject({
      status: 410,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
