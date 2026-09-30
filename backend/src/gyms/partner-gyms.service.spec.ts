import { GymStatus, RoleName } from '@prisma/client';
import { PartnerGymsService } from './partner-gyms.service';

describe('PartnerGymsService dashboard', () => {
  it('atomically creates a draft gym, OWNER membership, and owner role for the authenticated user', async () => {
    const tx = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'owner-role' }) },
      gym: { create: jest.fn().mockResolvedValue({ id: 'gym-a', name: 'First Gym', status: GymStatus.DRAFT }) },
      gymMembership: { create: jest.fn().mockResolvedValue({ id: 'membership-a' }) },
      userRole: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(<T>(operation: (client: typeof tx) => Promise<T>) => operation(tx)),
    };
    const service = new PartnerGymsService(prisma as never, {} as never);
    const user = { id: 'authenticated-user', roles: [RoleName.CUSTOMER], sessionId: 'session' };

    await expect(service.create(user, { name: ' First Gym ' })).resolves.toMatchObject({ id: 'gym-a', status: GymStatus.DRAFT });
    expect(tx.gym.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ownerId: user.id, name: 'First Gym' }) }));
    expect(tx.gymMembership.create).toHaveBeenCalledWith({ data: { userId: user.id, gymId: 'gym-a', role: 'OWNER' } });
    expect(tx.userRole.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId: user.id, roleId: 'owner-role' },
    }));
  });

  it('does not accept a client-supplied owner identity', async () => {
    const tx = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'owner-role' }) },
      gym: { create: jest.fn().mockResolvedValue({ id: 'gym-a', status: GymStatus.DRAFT }) },
      gymMembership: { create: jest.fn().mockResolvedValue({}) },
      userRole: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new PartnerGymsService({
      $transaction: jest.fn(<T>(operation: (client: typeof tx) => Promise<T>) => operation(tx)),
    } as never, {} as never);
    await service.create(
      { id: 'authenticated-user', roles: [RoleName.CUSTOMER], sessionId: 'session' },
      { name: 'Safe Gym', ownerId: 'attacker-selected-user' } as never,
    );
    expect(tx.gym.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ownerId: 'authenticated-user' }) }));
    expect(tx.gym.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ownerId: 'attacker-selected-user' }) }));
  });

  it('scopes summary counts to gyms accessible by the partner', async () => {
    const prisma = {
      gym: {
        groupBy: jest.fn().mockResolvedValue([
          { status: GymStatus.DRAFT, _count: { _all: 1 } },
          { status: GymStatus.APPROVED, _count: { _all: 2 } },
        ]),
      },
      gymBranch: { count: jest.fn().mockResolvedValue(5) },
    };
    const access = { isAdmin: jest.fn().mockReturnValue(false) };
    const service = new PartnerGymsService(prisma as never, access as never);

    await expect(
      service.summary({ id: 'owner', roles: [RoleName.GYM_OWNER], sessionId: 'session' }),
    ).resolves.toEqual({
      totalGyms: 3,
      totalBranches: 5,
      statuses: expect.objectContaining({ DRAFT: 1, APPROVED: 2, REJECTED: 0 }),
    });
    expect(prisma.gym.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ ownerId: 'owner' }]),
        }),
      }),
    );
  });
});
