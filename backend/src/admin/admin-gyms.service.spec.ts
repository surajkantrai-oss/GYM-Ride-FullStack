import { AuditAction, GymStatus, RoleName } from '@prisma/client';
import { AdminGymsService } from './admin-gyms.service';

describe('AdminGymsService', () => {
  it('builds a zero-filled dashboard summary from grouped statuses', async () => {
    const prisma = {
      gym: {
        groupBy: jest.fn().mockResolvedValue([
          { status: GymStatus.APPROVED, _count: { _all: 4 } },
          { status: GymStatus.PENDING_APPROVAL, _count: { _all: 2 } },
        ]),
      },
    };
    const service = new AdminGymsService(prisma as never);

    await expect(service.summary()).resolves.toEqual({
      totalGyms: 6,
      statuses: expect.objectContaining({
        APPROVED: 4,
        PENDING_APPROVAL: 2,
        DRAFT: 0,
        REJECTED: 0,
      }),
    });
  });

  it('atomically approves a pending gym and writes an audit record', async () => {
    const tx = {
      gym: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      gym: { findUnique: jest.fn().mockResolvedValue({ id: 'gym', status: GymStatus.APPROVED }) },
    };
    const service = new AdminGymsService(prisma as never);
    await service.approve({ id: 'admin', roles: [RoleName.ADMIN], sessionId: 'session' }, 'gym');
    expect(tx.gym.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'gym', status: GymStatus.PENDING_APPROVAL },
        data: expect.objectContaining({ status: GymStatus.APPROVED }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: AuditAction.GYM_APPROVED, actorUserId: 'admin' }),
    });
  });
});
