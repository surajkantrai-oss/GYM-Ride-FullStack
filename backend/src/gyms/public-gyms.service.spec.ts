import { GymStatus } from '@prisma/client';
import { PublicGymsService } from './public-gyms.service';

describe('PublicGymsService', () => {
  it('always constrains listing to approved gyms', async () => {
    const prisma = {
      gym: { findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };
    const service = new PublicGymsService(prisma as never);
    await service.list({ page: 1, limit: 20 });
    expect(prisma.gym.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: GymStatus.APPROVED }) }),
    );
  });
  it('builds a parameterized PostGIS nearby query', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const service = new PublicGymsService(prisma as never);
    await expect(
      service.nearby({
        page: 1,
        limit: 20,
        latitude: '23.2325',
        longitude: '77.4303',
        radiusKm: 3,
      }),
    ).resolves.toMatchObject({ data: [], meta: { page: 1 } });
    const query = prisma.$queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    expect(query.strings.join('')).toContain('ST_DWithin');
    expect(query.values).toEqual(expect.arrayContaining([23.2325, 77.4303, 3000]));
  });
});
