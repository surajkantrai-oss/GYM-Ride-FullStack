import { PlanStatus, PlanType, RoleName } from '@prisma/client';
import { PlansService } from './plans.service';
import { validate } from 'class-validator';
import { CreatePlanDto } from './dto/plan.dto';
import { DomainException } from '../common/errors/domain.exception';
import { ApiErrorCode } from '../common/errors/api-error-code';

describe('PlansService', () => {
  it('derives price duration and relational branch assignments', async () => {
    const prisma = {
      gymBranch: { count: jest.fn().mockResolvedValue(1) },
      gymPlan: { create: jest.fn().mockResolvedValue({ id: 'plan' }) },
    };
    const access = { assertGymManagement: jest.fn().mockResolvedValue(undefined) };
    const service = new PlansService(prisma as never, access as never);
    await service.create(
      { id: 'owner', roles: [RoleName.GYM_OWNER], sessionId: 'session' },
      'gym',
      {
        name: 'Monthly',
        type: PlanType.MONTHLY,
        priceMinor: 199900,
        currency: 'INR',
        branchIds: ['c437a4a2-75f7-44ff-8418-10e20da19bb3'],
      },
    );
    expect(prisma.gymPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          durationDays: 30,
          priceMinor: 199900,
          branches: { create: [{ branchId: 'c437a4a2-75f7-44ff-8418-10e20da19bb3' }] },
        }),
      }),
    );
  });

  it('exposes only active plans for approved gyms publicly', async () => {
    const prisma = { gymPlan: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new PlansService(prisma as never, {} as never);
    await service.publicForGym('gym');
    expect(prisma.gymPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: PlanStatus.ACTIVE, gym: { status: 'APPROVED' } }),
      }),
    );
  });

  it('rejects invalid prices and plan types at the DTO boundary', async () => {
    const dto = Object.assign(new CreatePlanDto(), {
      name: 'Pass',
      type: 'WEEKLY',
      priceMinor: 0,
      currency: 'INR',
      branchIds: ['not-a-uuid'],
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['type', 'priceMinor', 'branchIds']),
    );
  });

  it('rejects a branch from another gym', async () => {
    const prisma = { gymBranch: { count: jest.fn().mockResolvedValue(0) } };
    const access = { assertGymManagement: jest.fn().mockResolvedValue(undefined) };
    const service = new PlansService(prisma as never, access as never);
    await expect(
      service.create({ id: 'owner', roles: [RoleName.GYM_OWNER], sessionId: 'session' }, 'gym', {
        name: 'Pass',
        type: PlanType.DAY_PASS,
        priceMinor: 19900,
        currency: 'INR',
        branchIds: ['c437a4a2-75f7-44ff-8418-10e20da19bb3'],
      }),
    ).rejects.toThrow('Every selected branch');
  });

  it('rejects plan access when the actor cannot manage its gym', async () => {
    const prisma = {
      gymPlan: { findUnique: jest.fn().mockResolvedValue({ id: 'plan', gymId: 'gym-b' }) },
    };
    const access = {
      assertGymManagement: jest
        .fn()
        .mockRejectedValue(
          new DomainException(ApiErrorCode.GYM_ACCESS_DENIED, 'Gym access denied', 403),
        ),
    };
    const service = new PlansService(prisma as never, access as never);
    await expect(
      service.get({ id: 'owner-a', roles: [RoleName.GYM_OWNER], sessionId: 'session' }, 'plan'),
    ).rejects.toBeInstanceOf(DomainException);
    expect(access.assertGymManagement).toHaveBeenCalledWith(expect.anything(), 'gym-b');
  });

  it('uses resource authorization and activates/deactivates without deleting history', async () => {
    const prisma = {
      gymPlan: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            gymId: 'gym',
            status: PlanStatus.DRAFT,
            branches: [{ branchId: 'branch' }],
          })
          .mockResolvedValueOnce({
            gymId: 'gym',
            status: PlanStatus.ACTIVE,
            branches: [{ branchId: 'branch' }],
          }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    const access = { assertGymManagement: jest.fn().mockResolvedValue(undefined) };
    const service = new PlansService(prisma as never, access as never);
    await expect(
      service.setStatus(
        { id: 'manager', roles: [RoleName.GYM_MANAGER], sessionId: 'session' },
        'plan',
        PlanStatus.ACTIVE,
      ),
    ).resolves.toEqual({ status: PlanStatus.ACTIVE });
    await expect(
      service.setStatus(
        { id: 'manager', roles: [RoleName.GYM_MANAGER], sessionId: 'session' },
        'plan',
        PlanStatus.INACTIVE,
      ),
    ).resolves.toEqual({ status: PlanStatus.INACTIVE });
    expect(access.assertGymManagement).toHaveBeenCalledWith(expect.anything(), 'gym');
  });
});
