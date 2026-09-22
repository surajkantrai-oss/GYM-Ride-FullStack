import { AmenitiesService } from './amenities.service';

describe('AmenitiesService', () => {
  it('rejects an unknown amenity before replacing assignments', async () => {
    const prisma = { amenity: { count: jest.fn().mockResolvedValue(1) } };
    const access = { assertBranchManagement: jest.fn().mockResolvedValue(undefined) };
    const service = new AmenitiesService(prisma as never, access as never);
    await expect(service.replace({} as never, 'branch', ['amenity-a', 'missing'])).rejects.toThrow(
      'do not exist',
    );
  });
  it('replaces assignments transactionally', async () => {
    const tx = { branchAmenity: { deleteMany: jest.fn(), createMany: jest.fn() } };
    const prisma = {
      amenity: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'amenity' }]),
      },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new AmenitiesService(
      prisma as never,
      { assertBranchManagement: jest.fn() } as never,
    );
    await service.replace({} as never, 'branch', ['amenity']);
    expect(tx.branchAmenity.deleteMany).toHaveBeenCalledWith({ where: { branchId: 'branch' } });
    expect(tx.branchAmenity.createMany).toHaveBeenCalledTimes(1);
  });
});
