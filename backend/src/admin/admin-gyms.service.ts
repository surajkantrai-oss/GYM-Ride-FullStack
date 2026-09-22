import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, GymStatus, Prisma } from '@prisma/client';
import { pageMeta } from '../common/dto/pagination.dto';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { AdminGymListDto } from '../gyms/dto/gym.dto';
import { canTransition } from '../gyms/gym-state';

const adminGymSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  statusReason: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  branches: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      latitude: true,
      longitude: true,
      timezone: true,
      status: true,
      amenities: { select: { amenity: { select: { id: true, name: true, slug: true } } } },
      operatingHours: {
        select: { weekday: true, period: true, opensAt: true, closesAt: true, isClosed: true },
      },
    },
  },
} satisfies Prisma.GymSelect;

@Injectable()
export class AdminGymsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: AdminGymListDto): Promise<unknown> {
    const where: Prisma.GymWhereInput = {
      status: query.status,
      ...(query.city && {
        branches: { some: { city: { equals: query.city, mode: 'insensitive' } } },
      }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          {
            branches: {
              some: {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { city: { contains: query.search, mode: 'insensitive' } },
                  { address: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.gym.findMany({
        where,
        select: adminGymSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.gym.count({ where }),
    ]);
    return { data, meta: pageMeta(query.page, query.limit, total) };
  }
  async get(gymId: string): Promise<unknown> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: adminGymSelect });
    if (!gym) this.notFound();
    return gym;
  }
  async summary(): Promise<unknown> {
    const groups = await this.prisma.gym.groupBy({ by: ['status'], _count: { _all: true } });
    const statuses: Record<string, number> = Object.fromEntries(
      Object.values(GymStatus).map((status) => [status, 0]),
    );
    for (const group of groups) statuses[group.status] = group._count._all;
    return {
      totalGyms: groups.reduce((sum, group) => sum + group._count._all, 0),
      statuses,
    };
  }
  audit(gymId: string): Promise<unknown[]> {
    return this.prisma.auditLog.findMany({
      where: { entityType: 'Gym', entityId: gymId },
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  approve(user: AuthUser, gymId: string): Promise<unknown> {
    return this.transition(
      user,
      gymId,
      GymStatus.PENDING_APPROVAL,
      GymStatus.APPROVED,
      AuditAction.GYM_APPROVED,
    );
  }
  reject(user: AuthUser, gymId: string, reason: string): Promise<unknown> {
    return this.transition(
      user,
      gymId,
      GymStatus.PENDING_APPROVAL,
      GymStatus.REJECTED,
      AuditAction.GYM_REJECTED,
      reason,
    );
  }
  suspend(user: AuthUser, gymId: string, reason: string): Promise<unknown> {
    return this.transition(
      user,
      gymId,
      GymStatus.APPROVED,
      GymStatus.SUSPENDED,
      AuditAction.GYM_SUSPENDED,
      reason,
    );
  }
  reactivate(user: AuthUser, gymId: string): Promise<unknown> {
    return this.transition(
      user,
      gymId,
      GymStatus.SUSPENDED,
      GymStatus.APPROVED,
      AuditAction.GYM_REACTIVATED,
    );
  }

  private async transition(
    user: AuthUser,
    gymId: string,
    from: GymStatus,
    to: GymStatus,
    action: AuditAction,
    reason?: string,
  ): Promise<unknown> {
    if (!canTransition(from, to)) this.invalidTransition();
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.gym.updateMany({
        where: { id: gymId, status: from },
        data: { status: to, statusReason: reason ?? null, reviewedAt: new Date() },
      });
      if (result.count !== 1) {
        const exists = await tx.gym.count({ where: { id: gymId } });
        if (!exists) this.notFound();
        this.invalidTransition();
      }
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action,
          entityType: 'Gym',
          entityId: gymId,
          metadata: reason ? { reason } : undefined,
        },
      });
    });
    return this.get(gymId);
  }
  private notFound(): never {
    throw new DomainException(ApiErrorCode.GYM_NOT_FOUND, 'Gym not found', HttpStatus.NOT_FOUND);
  }
  private invalidTransition(): never {
    throw new DomainException(
      ApiErrorCode.INVALID_GYM_STATUS_TRANSITION,
      'Invalid gym status transition',
      HttpStatus.CONFLICT,
    );
  }
}
