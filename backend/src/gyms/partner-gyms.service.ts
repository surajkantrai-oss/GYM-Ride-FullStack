import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  GymMembershipRole,
  GymStatus,
  MembershipStatus,
  Prisma,
  RoleName,
} from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { pageMeta } from '../common/dto/pagination.dto';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { CreateGymDto, PartnerGymListDto, UpdateGymDto } from './dto/gym.dto';
import { ownerCanEdit } from './gym-state';

const privateGymSelect = {
  id: true,
  name: true,
  description: true,
  ownerId: true,
  status: true,
  statusReason: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  branches: { select: { id: true, name: true, city: true, status: true } },
} satisfies Prisma.GymSelect;

@Injectable()
export class PartnerGymsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
  ) {}
  async create(user: AuthUser, dto: CreateGymDto): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      const ownerRole = await tx.role.findUnique({ where: { name: RoleName.GYM_OWNER } });
      if (!ownerRole)
        throw new DomainException(
          ApiErrorCode.INTERNAL_ERROR,
          'Gym owner role is not configured',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      const gym = await tx.gym.create({
        data: { name: dto.name.trim(), description: dto.description?.trim(), ownerId: user.id },
        select: privateGymSelect,
      });
      await tx.gymMembership.create({
        data: { userId: user.id, gymId: gym.id, role: GymMembershipRole.OWNER },
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: ownerRole.id } },
        create: { userId: user.id, roleId: ownerRole.id },
        update: {},
      });
      return gym;
    });
  }
  private accessibleWhere(user: AuthUser): Prisma.GymWhereInput {
    return this.access.isAdmin(user)
      ? {}
      : {
          OR: [
            { ownerId: user.id },
            { memberships: { some: { userId: user.id, status: MembershipStatus.ACTIVE } } },
          ],
        };
  }
  async list(user: AuthUser, query: PartnerGymListDto): Promise<unknown> {
    const where: Prisma.GymWhereInput = {
      AND: [
        this.accessibleWhere(user),
        { status: query.status },
        ...(query.search
          ? [{ name: { contains: query.search, mode: 'insensitive' as const } }]
          : []),
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.gym.findMany({
        where,
        select: privateGymSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.gym.count({ where }),
    ]);
    return { data, meta: pageMeta(query.page, query.limit, total) };
  }
  async summary(user: AuthUser): Promise<unknown> {
    const access = this.accessibleWhere(user);
    const groups = await this.prisma.gym.groupBy({
      by: ['status'],
      where: access,
      _count: { _all: true },
    });
    const totalBranches = await this.prisma.gymBranch.count({ where: { gym: access } });
    const statuses: Record<string, number> = Object.fromEntries(
      Object.values(GymStatus).map((status) => [status, 0]),
    );
    for (const group of groups) statuses[group.status] = group._count._all;
    return {
      totalGyms: groups.reduce((sum, group) => sum + group._count._all, 0),
      totalBranches,
      statuses,
    };
  }
  async get(user: AuthUser, gymId: string): Promise<unknown> {
    await this.access.assertGymManagement(user, gymId);
    return this.prisma.gym.findUnique({ where: { id: gymId }, select: privateGymSelect });
  }
  async update(user: AuthUser, gymId: string, dto: UpdateGymDto): Promise<unknown> {
    const gym = await this.access.assertGymOwnerOrAdmin(user, gymId);
    if (!this.access.isAdmin(user) && !ownerCanEdit(gym.status as GymStatus))
      throw new DomainException(
        ApiErrorCode.GYM_NOT_EDITABLE,
        'Gym cannot be edited in its current status',
        HttpStatus.CONFLICT,
      );
    return this.prisma.gym.update({
      where: { id: gymId },
      data: { name: dto.name?.trim(), description: dto.description?.trim() },
      select: privateGymSelect,
    });
  }
  async submit(user: AuthUser, gymId: string): Promise<unknown> {
    const gym = await this.access.assertGymOwnerOrAdmin(user, gymId);
    if (gym.status !== GymStatus.DRAFT && gym.status !== GymStatus.REJECTED)
      throw new DomainException(
        ApiErrorCode.INVALID_GYM_STATUS_TRANSITION,
        'Only draft or rejected gyms can be submitted',
        HttpStatus.CONFLICT,
      );
    const branches = await this.prisma.gymBranch.findMany({
      where: { gymId },
      select: { id: true, operatingHours: { select: { id: true }, take: 1 } },
    });
    const missing: string[] = [];
    if (!branches.length) missing.push('branch');
    if (branches.some((branch) => branch.operatingHours.length === 0))
      missing.push('branch_operating_hours');
    if (missing.length)
      throw new DomainException(
        ApiErrorCode.GYM_PROFILE_INCOMPLETE,
        'Gym profile is incomplete',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { missing },
      );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gym.update({
        where: { id: gymId },
        data: { status: GymStatus.PENDING_APPROVAL, statusReason: null, submittedAt: new Date() },
        select: privateGymSelect,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: AuditAction.GYM_SUBMITTED,
          entityType: 'Gym',
          entityId: gymId,
        },
      });
      return updated;
    });
  }
}
