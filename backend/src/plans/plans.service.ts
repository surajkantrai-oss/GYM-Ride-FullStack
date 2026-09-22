import { HttpStatus, Injectable } from '@nestjs/common';
import { GymStatus, PlanStatus, PlanType, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { CreatePlanDto, PlanListDto, UpdatePlanDto } from './dto/plan.dto';

export const planSelect = {
  id: true,
  gymId: true,
  name: true,
  description: true,
  type: true,
  priceMinor: true,
  currency: true,
  durationDays: true,
  visitLimit: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  branches: { select: { branch: { select: { id: true, name: true, city: true, status: true } } } },
} satisfies Prisma.GymPlanSelect;

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
  ) {}

  async create(user: AuthUser, gymId: string, dto: CreatePlanDto): Promise<unknown> {
    await this.access.assertGymManagement(user, gymId);
    await this.assertBranches(gymId, dto.branchIds);
    return this.prisma.gymPlan.create({
      data: {
        gymId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        type: dto.type,
        priceMinor: dto.priceMinor,
        currency: dto.currency,
        durationDays: this.duration(dto.type),
        visitLimit: dto.visitLimit,
        branches: { create: dto.branchIds.map((branchId) => ({ branchId })) },
      },
      select: planSelect,
    });
  }

  async list(user: AuthUser, gymId: string, query: PlanListDto): Promise<unknown[]> {
    await this.access.assertGymManagement(user, gymId);
    return this.prisma.gymPlan.findMany({
      where: { gymId, status: query.status },
      select: planSelect,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(user: AuthUser, planId: string): Promise<unknown> {
    const plan = await this.prisma.gymPlan.findUnique({
      where: { id: planId },
      select: planSelect,
    });
    if (!plan) this.notFound();
    await this.access.assertGymManagement(user, plan.gymId);
    return plan;
  }

  async update(user: AuthUser, planId: string, dto: UpdatePlanDto): Promise<unknown> {
    const existing = await this.prisma.gymPlan.findUnique({ where: { id: planId } });
    if (!existing) this.notFound();
    await this.access.assertGymManagement(user, existing.gymId);
    if (existing.status === PlanStatus.ARCHIVED)
      throw new DomainException(
        ApiErrorCode.PLAN_INACTIVE,
        'Archived plans cannot be edited',
        HttpStatus.CONFLICT,
      );
    if (dto.branchIds) await this.assertBranches(existing.gymId, dto.branchIds);
    return this.prisma.$transaction(async (tx) => {
      if (dto.branchIds) {
        await tx.planBranch.deleteMany({ where: { planId } });
        await tx.planBranch.createMany({
          data: dto.branchIds.map((branchId) => ({ planId, branchId })),
        });
      }
      return tx.gymPlan.update({
        where: { id: planId },
        data: {
          name: dto.name?.trim(),
          description: dto.description?.trim(),
          type: dto.type,
          priceMinor: dto.priceMinor,
          currency: dto.currency,
          visitLimit: dto.visitLimit,
          ...(dto.type && { durationDays: this.duration(dto.type) }),
        },
        select: planSelect,
      });
    });
  }

  async setStatus(user: AuthUser, planId: string, status: PlanStatus): Promise<unknown> {
    const existing = await this.prisma.gymPlan.findUnique({
      where: { id: planId },
      select: { gymId: true, status: true, branches: { select: { branchId: true } } },
    });
    if (!existing) this.notFound();
    await this.access.assertGymManagement(user, existing.gymId);
    const allowed =
      (status === PlanStatus.ACTIVE &&
        (existing.status === PlanStatus.DRAFT || existing.status === PlanStatus.INACTIVE)) ||
      (status === PlanStatus.INACTIVE && existing.status === PlanStatus.ACTIVE);
    if (!allowed)
      throw new DomainException(
        ApiErrorCode.PLAN_INACTIVE,
        'Invalid plan status transition',
        HttpStatus.CONFLICT,
      );
    if (status === PlanStatus.ACTIVE && existing.branches.length === 0)
      throw new DomainException(
        ApiErrorCode.PLAN_NOT_AVAILABLE_AT_BRANCH,
        'Assign at least one branch before activation',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    return this.prisma.gymPlan.update({
      where: { id: planId },
      data: { status },
      select: planSelect,
    });
  }

  publicForGym(gymId: string): Promise<unknown[]> {
    return this.prisma.gymPlan.findMany({
      where: { gymId, status: PlanStatus.ACTIVE, gym: { status: GymStatus.APPROVED } },
      select: planSelect,
      orderBy: { priceMinor: 'asc' },
    });
  }

  publicForBranch(branchId: string): Promise<unknown[]> {
    return this.prisma.gymPlan.findMany({
      where: {
        status: PlanStatus.ACTIVE,
        gym: { status: GymStatus.APPROVED },
        branches: { some: { branchId } },
      },
      select: planSelect,
      orderBy: { priceMinor: 'asc' },
    });
  }

  private async assertBranches(gymId: string, branchIds: string[]): Promise<void> {
    const count = await this.prisma.gymBranch.count({ where: { id: { in: branchIds }, gymId } });
    if (count !== branchIds.length)
      throw new DomainException(
        ApiErrorCode.PLAN_NOT_AVAILABLE_AT_BRANCH,
        'Every selected branch must belong to this gym',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }
  private duration(type: PlanType): number {
    return { DAY_PASS: 1, MONTHLY: 30, QUARTERLY: 90, YEARLY: 365 }[type];
  }
  private notFound(): never {
    throw new DomainException(ApiErrorCode.PLAN_NOT_FOUND, 'Plan not found', HttpStatus.NOT_FOUND);
  }
}
