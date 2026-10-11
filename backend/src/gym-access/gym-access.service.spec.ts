import { RoleName } from '@prisma/client';
import { GymAccessService } from './gym-access.service';

describe('GymAccessService ownership', () => {
  const ownerA = { id: 'owner-a', roles: [RoleName.GYM_OWNER], sessionId: 'session' };
  it('allows an owner to access their gym', async () => {
    const service = new GymAccessService({
      gym: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'gym-a', ownerId: 'owner-a', status: 'DRAFT' }),
      },
    } as never);
    await expect(service.assertGymOwnerOrAdmin(ownerA, 'gym-a')).resolves.toMatchObject({
      id: 'gym-a',
    });
  });
  it('hides another owner gym to prevent IDOR', async () => {
    const service = new GymAccessService({
      gym: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'gym-b', ownerId: 'owner-b', status: 'DRAFT' }),
      },
    } as never);
    await expect(service.assertGymOwnerOrAdmin(ownerA, 'gym-b')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('allows a platform admin to use gym-scoped GymOS write services', async () => {
    const service = new GymAccessService({
      gym: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner-a' }) },
    } as never);
    await expect(
      service.assertGymOsMemberWrite(
        { id: 'admin-a', roles: [RoleName.ADMIN], sessionId: 'session' },
        'gym-a',
      ),
    ).resolves.toBeUndefined();
  });
  it('does not let an unrelated partner write another gym GymOS data', async () => {
    const service = new GymAccessService({
      gym: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner-a' }) },
      gymMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);
    await expect(
      service.assertGymOsMemberWrite(
        { id: 'manager-b', roles: [RoleName.GYM_MANAGER], sessionId: 'session' },
        'gym-a',
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('allows active branch-scoped staff to verify only their branch', async () => {
    const membership = {
      findFirst: jest.fn().mockResolvedValueOnce({ id: 'membership' }).mockResolvedValueOnce(null),
    };
    const service = new GymAccessService({
      gymBranch: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve({ id: where.id, gymId: 'gym-a', gym: { ownerId: 'owner-a' } }),
          ),
      },
      gymMembership: membership,
    } as never);
    const staff = { id: 'staff-a', roles: [RoleName.GYM_STAFF], sessionId: 'session' };
    await expect(service.assertBranchCheckIn(staff, 'branch-a')).resolves.toEqual({
      id: 'branch-a',
      gymId: 'gym-a',
    });
    await expect(service.assertBranchCheckIn(staff, 'branch-b')).rejects.toMatchObject({
      status: 403,
    });
    expect(membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'staff-a',
          gymId: 'gym-a',
          status: 'ACTIVE',
        }),
      }),
    );
  });
});
