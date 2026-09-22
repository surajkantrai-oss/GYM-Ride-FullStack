import { GymStatus, RoleName } from '@prisma/client';
import { PartnerGymsService } from './partner-gyms.service';

describe('PartnerGymsService dashboard', () => {
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
