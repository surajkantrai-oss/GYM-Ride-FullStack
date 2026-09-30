/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  GymMemberStatus,
  GymOsFeature,
  GymOsMembershipDurationType,
  GymOsMembershipEventType,
  GymOsMembershipPlanStatus,
  GymOsMembershipStatus,
  Prisma,
} from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import {
  AssignMembershipDto,
  CreateMembershipPlanDto,
  MembershipListDto,
  RenewMembershipDto,
  UpdateMembershipPlanDto,
} from './gym-os-membership.dto';
import { GymOsEntitlementService } from './gym-os-entitlement.service';

@Injectable()
export class GymOsMembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
    private readonly entitlements: GymOsEntitlementService,
  ) {}
  async plans(user: AuthUser, gymId: string) {
    await this.authorize(user, gymId, false);
    await this.requireFeature(gymId);
    return this.prisma.gymOsMembershipPlan.findMany({
      where: { gymId },
      include: {
        branches: { include: { branch: { select: { id: true, name: true } } } },
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async plan(user: AuthUser, gymId: string, id: string) {
    await this.authorize(user, gymId, false);
    await this.requireFeature(gymId);
    const value = await this.prisma.gymOsMembershipPlan.findFirst({
      where: { id, gymId },
      include: { branches: true },
    });
    if (!value) this.planMissing();
    return value;
  }
  async createPlan(user: AuthUser, gymId: string, dto: CreateMembershipPlanDto) {
    await this.authorize(user, gymId, true);
    await this.requireFeature(gymId);
    await this.branches(gymId, dto.branchIds);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const value = await tx.gymOsMembershipPlan.create({
          data: {
            gymId,
            name: dto.name.trim(),
            code: dto.code.trim().toUpperCase(),
            description: dto.description?.trim(),
            durationType: dto.durationType,
            durationValue: dto.durationValue,
            priceMinor: dto.priceMinor,
            currency: dto.currency.toUpperCase(),
            createdByUserId: user.id,
            branches: { create: (dto.branchIds ?? []).map((branchId) => ({ branchId })) },
          },
          include: { branches: true },
        });
        await this.audit(
          tx,
          user.id,
          AuditAction.GYMOS_MEMBERSHIP_PLAN_CHANGED,
          'GymOsMembershipPlan',
          value.id,
          { gymId, operation: 'created' },
        );
        return value;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        this.fail(
          ApiErrorCode.GYMOS_MEMBERSHIP_PLAN_CODE_EXISTS,
          'Membership plan code already exists for this gym',
          HttpStatus.CONFLICT,
        );
      this.rethrow(e);
    }
  }
  async updatePlan(user: AuthUser, gymId: string, id: string, dto: UpdateMembershipPlanDto) {
    await this.authorize(user, gymId, true);
    await this.requireFeature(gymId);
    const plan = await this.plan(user, gymId, id);
    if (plan.status === GymOsMembershipPlanStatus.ARCHIVED) this.invalid();
    await this.branches(gymId, dto.branchIds);
    const { branchIds, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      if (branchIds) {
        await tx.gymOsMembershipPlanBranch.deleteMany({ where: { planId: id } });
        await tx.gymOsMembershipPlanBranch.createMany({
          data: branchIds.map((branchId) => ({ planId: id, branchId })),
        });
      }
      const value = await tx.gymOsMembershipPlan.update({
        where: { id },
        data: {
          ...data,
          code: data.code?.trim().toUpperCase(),
          currency: data.currency?.toUpperCase(),
          updatedByUserId: user.id,
        },
        include: { branches: true },
      });
      await this.audit(
        tx,
        user.id,
        AuditAction.GYMOS_MEMBERSHIP_PLAN_CHANGED,
        'GymOsMembershipPlan',
        id,
        { gymId, operation: 'updated' },
      );
      return value;
    });
  }
  async planStatus(user: AuthUser, gymId: string, id: string, status: GymOsMembershipPlanStatus) {
    await this.authorize(user, gymId, true);
    await this.requireFeature(gymId);
    const plan = await this.plan(user, gymId, id);
    if (
      plan.status === GymOsMembershipPlanStatus.ARCHIVED &&
      status !== GymOsMembershipPlanStatus.ARCHIVED
    )
      this.invalid();
    const value = await this.prisma.gymOsMembershipPlan.update({
      where: { id },
      data: {
        status,
        archivedAt: status === GymOsMembershipPlanStatus.ARCHIVED ? new Date() : null,
        updatedByUserId: user.id,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: AuditAction.GYMOS_MEMBERSHIP_PLAN_CHANGED,
        entityType: 'GymOsMembershipPlan',
        entityId: id,
        metadata: { gymId, status },
      },
    });
    return value;
  }
  async assign(user: AuthUser, gymId: string, memberId: string, dto: AssignMembershipDto) {
    await this.authorize(user, gymId, true);
    await this.requireFeature(gymId);
    return this.prisma
      .$transaction(
        async (tx) => {
          await this.lock(tx, memberId);
          const [member, plan] = await Promise.all([
            tx.gymMember.findFirst({
              where: { id: memberId, gymId, status: { not: GymMemberStatus.ARCHIVED } },
            }),
            tx.gymOsMembershipPlan.findFirst({
              where: { id: dto.planId, gymId },
              include: { branches: true },
            }),
          ]);
          if (!member) this.memberMissing();
          if (!plan) this.planMissing();
          if (plan.status !== GymOsMembershipPlanStatus.ACTIVE)
            this.fail(
              ApiErrorCode.GYMOS_MEMBERSHIP_PLAN_INACTIVE,
              'Membership plan is not active',
              HttpStatus.CONFLICT,
            );
          const start = this.date(dto.startDate),
            today = await this.today(gymId, tx);
          const end = this.endDate(start, plan.durationType, plan.durationValue);
          await this.assertNoOverlap(tx, memberId, start, end);
          const status =
            start > today ? GymOsMembershipStatus.SCHEDULED : GymOsMembershipStatus.ACTIVE;
          const value = await tx.gymOsMembership.create({
            data: {
              gymId,
              memberId,
              membershipPlanId: plan.id,
              status,
              startDate: start,
              endDate: end,
              planNameSnapshot: plan.name,
              planCodeSnapshot: plan.code,
              durationTypeSnapshot: plan.durationType,
              durationValueSnapshot: plan.durationValue,
              priceMinorSnapshot: plan.priceMinor,
              currencySnapshot: plan.currency,
              branchIdsSnapshot: plan.branches.map((b) => b.branchId),
              createdByUserId: user.id,
            },
          });
          await this.event(
            tx,
            value,
            status === GymOsMembershipStatus.ACTIVE
              ? GymOsMembershipEventType.ACTIVATED
              : GymOsMembershipEventType.CREATED,
            user.id,
          );
          await this.audit(
            tx,
            user.id,
            AuditAction.GYMOS_MEMBERSHIP_CREATED,
            'GymOsMembership',
            value.id,
            { gymId, memberId },
          );
          await this.createCharge(tx, value, user.id, false);
          return value;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((e) => this.rethrow(e));
  }
  async memberHistory(user: AuthUser, gymId: string, memberId: string) {
    await this.authorize(user, gymId, false);
    await this.requireFeature(gymId);
    await this.reconcile(gymId);
    return this.prisma.gymOsMembership.findMany({
      where: { gymId, memberId },
      include: { events: { orderBy: { occurredAt: 'desc' } } },
      orderBy: { startDate: 'desc' },
    });
  }
  async freeze(user: AuthUser, gymId: string, id: string, reason: string) {
    return this.transition(
      user,
      gymId,
      id,
      GymOsMembershipStatus.ACTIVE,
      GymOsMembershipStatus.FROZEN,
      AuditAction.GYMOS_MEMBERSHIP_FROZEN,
      GymOsMembershipEventType.FROZEN,
      { freezeStartedAt: new Date() },
      reason,
    );
  }
  async resume(user: AuthUser, gymId: string, id: string) {
    await this.authorize(user, gymId, true);
    await this.requireFeature(gymId);
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, id);
        const m = await tx.gymOsMembership.findFirst({ where: { id, gymId } });
        if (!m) this.membershipMissing();
        if (m.status !== GymOsMembershipStatus.FROZEN || !m.freezeStartedAt)
          this.fail(
            ApiErrorCode.GYMOS_MEMBERSHIP_NOT_FROZEN,
            'Membership is not frozen',
            HttpStatus.CONFLICT,
          );
        const days = Math.max(1, Math.floor((Date.now() - m.freezeStartedAt.getTime()) / 86400000));
        const end = new Date(m.endDate);
        end.setUTCDate(end.getUTCDate() + days);
        const value = await tx.gymOsMembership.update({
          where: { id },
          data: {
            status: GymOsMembershipStatus.ACTIVE,
            endDate: end,
            freezeStartedAt: null,
            totalFrozenDays: { increment: days },
            updatedByUserId: user.id,
          },
        });
        await this.event(tx, value, GymOsMembershipEventType.RESUMED, user.id, undefined, {
          frozenDays: days,
          newEndDate: this.iso(end),
        });
        await this.audit(tx, user.id, AuditAction.GYMOS_MEMBERSHIP_RESUMED, 'GymOsMembership', id, {
          gymId,
          frozenDays: days,
        });
        return value;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async cancel(user: AuthUser, gymId: string, id: string, reason: string) {
    await this.authorize(user, gymId, true);
    await this.requireFeature(gymId);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const m = await tx.gymOsMembership.findFirst({ where: { id, gymId } });
      if (!m) this.membershipMissing();
      if (
        m.status !== GymOsMembershipStatus.ACTIVE &&
        m.status !== GymOsMembershipStatus.SCHEDULED &&
        m.status !== GymOsMembershipStatus.FROZEN
      )
        this.invalid();
      const value = await tx.gymOsMembership.update({
        where: { id },
        data: {
          status: GymOsMembershipStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
          freezeStartedAt: null,
          updatedByUserId: user.id,
        },
      });
      await this.event(tx, value, GymOsMembershipEventType.CANCELLED, user.id, reason);
      await this.audit(tx, user.id, AuditAction.GYMOS_MEMBERSHIP_CANCELLED, 'GymOsMembership', id, {
        gymId,
      });
      return value;
    });
  }
  async renew(user: AuthUser, gymId: string, id: string, dto: RenewMembershipDto) {
    await this.authorize(user, gymId, true);
    await this.requireFeature(gymId);
    await this.reconcile(gymId);
    return this.prisma
      .$transaction(
        async (tx) => {
          await this.lock(tx, id);
          const old = await tx.gymOsMembership.findFirst({ where: { id, gymId } });
          if (!old) this.membershipMissing();
          if (old.status === GymOsMembershipStatus.CANCELLED)
            this.fail(
              ApiErrorCode.GYMOS_MEMBERSHIP_CANCELLED,
              'Cancelled membership cannot be renewed',
              HttpStatus.CONFLICT,
            );
          const plan = await tx.gymOsMembershipPlan.findFirst({
            where: { id: dto.planId, gymId, status: GymOsMembershipPlanStatus.ACTIVE },
            include: { branches: true },
          });
          if (!plan) this.planMissing();
          const today = await this.today(gymId, tx);
          const defaultStart = old.endDate >= today ? this.addDays(old.endDate, 1) : today;
          const start = dto.startDate ? this.date(dto.startDate) : defaultStart,
            end = this.endDate(start, plan.durationType, plan.durationValue);
          await this.assertNoOverlap(tx, old.memberId, start, end, old.id);
          const value = await tx.gymOsMembership.create({
            data: {
              gymId,
              memberId: old.memberId,
              membershipPlanId: plan.id,
              status:
                start > today ? GymOsMembershipStatus.SCHEDULED : GymOsMembershipStatus.ACTIVE,
              startDate: start,
              endDate: end,
              planNameSnapshot: plan.name,
              planCodeSnapshot: plan.code,
              durationTypeSnapshot: plan.durationType,
              durationValueSnapshot: plan.durationValue,
              priceMinorSnapshot: plan.priceMinor,
              currencySnapshot: plan.currency,
              branchIdsSnapshot: plan.branches.map((b) => b.branchId),
              renewedFromMembershipId: old.id,
              createdByUserId: user.id,
            },
          });
          await this.event(tx, value, GymOsMembershipEventType.RENEWED, user.id, undefined, {
            renewedFrom: old.id,
          });
          await this.audit(
            tx,
            user.id,
            AuditAction.GYMOS_MEMBERSHIP_RENEWED,
            'GymOsMembership',
            value.id,
            { gymId, renewedFrom: old.id },
          );
          await this.createCharge(tx, value, user.id, true);
          return value;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((e) => this.rethrow(e));
  }
  async list(user: AuthUser, gymId: string, q: MembershipListDto) {
    await this.authorize(user, gymId, false);
    await this.requireFeature(gymId);
    await this.reconcile(gymId);
    return this.listInternal({ ...q, gymId });
  }
  async expirySummary(user: AuthUser, gymId: string) {
    await this.authorize(user, gymId, false);
    await this.requireFeature(gymId);
    await this.reconcile(gymId);
    const today = await this.today(gymId, this.prisma),
      dates = [0, 1, 2, 3, 7].map((n) => this.addDays(today, n)),
      monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    const base = { gymId, status: { not: GymOsMembershipStatus.CANCELLED } } as const;
    const [expired, todayCount, in1Day, in2Days, in3Days, within7Days, thisMonth, statuses] =
      await Promise.all([
        this.prisma.gymOsMembership.count({ where: { ...base, endDate: { lt: today } } }),
        this.prisma.gymOsMembership.count({ where: { ...base, endDate: dates[0] } }),
        this.prisma.gymOsMembership.count({ where: { ...base, endDate: dates[1] } }),
        this.prisma.gymOsMembership.count({ where: { ...base, endDate: dates[2] } }),
        this.prisma.gymOsMembership.count({ where: { ...base, endDate: dates[3] } }),
        this.prisma.gymOsMembership.count({
          where: { ...base, endDate: { gte: today, lte: dates[4] } },
        }),
        this.prisma.gymOsMembership.count({
          where: { ...base, endDate: { gte: today, lte: monthEnd } },
        }),
        this.prisma.gymOsMembership.groupBy({ by: ['status'], where: { gymId }, _count: true }),
      ]);
    const statusCounts = Object.fromEntries(statuses.map((s) => [s.status, s._count]));
    return {
      expired,
      today: todayCount,
      in1Day,
      in2Days,
      in3Days,
      within7Days,
      thisMonth,
      active: statusCounts[GymOsMembershipStatus.ACTIVE] ?? 0,
      frozen: statusCounts[GymOsMembershipStatus.FROZEN] ?? 0,
      scheduled: statusCounts[GymOsMembershipStatus.SCHEDULED] ?? 0,
      cancelled: statusCounts[GymOsMembershipStatus.CANCELLED] ?? 0,
      statuses: statusCounts,
    };
  }
  adminPlans(q: MembershipListDto) {
    return this.prisma.gymOsMembershipPlan.findMany({
      where: { gymId: q.gymId },
      include: { gym: { select: { id: true, name: true } }, branches: true },
      take: q.pageSize,
      skip: (q.page - 1) * q.pageSize,
      orderBy: { createdAt: 'desc' },
    });
  }
  adminMemberships(q: MembershipListDto) {
    return this.listInternal(q);
  }
  async adminMembership(id: string) {
    const value = await this.prisma.gymOsMembership.findUnique({
      where: { id },
      include: {
        gym: { select: { id: true, name: true } },
        member: {
          select: { id: true, memberCode: true, firstName: true, lastName: true, phone: true },
        },
        events: { orderBy: { occurredAt: 'desc' } },
      },
    });
    if (!value) this.membershipMissing();
    return value;
  }
  async reconcile(gymId?: string) {
    const gyms = gymId
      ? [gymId]
      : (
          await this.prisma.gym.findMany({
            where: {
              gymOsMemberships: {
                some: {
                  status: { in: [GymOsMembershipStatus.SCHEDULED, GymOsMembershipStatus.ACTIVE] },
                },
              },
            },
            select: { id: true },
          })
        ).map((g) => g.id);
    let activated = 0,
      expired = 0;
    for (const id of gyms) {
      const today = await this.today(id, this.prisma);
      // Expire ended memberships before activating scheduled renewals. This order
      // preserves the database invariant of one active/frozen membership per member.
      const active = await this.prisma.gymOsMembership.findMany({
        where: { gymId: id, status: GymOsMembershipStatus.ACTIVE, endDate: { lt: today } },
      });
      for (const m of active) {
        if (
          await this.reconcileTransition(
            m,
            GymOsMembershipStatus.ACTIVE,
            GymOsMembershipStatus.EXPIRED,
            GymOsMembershipEventType.EXPIRED,
          )
        ) {
          expired++;
        }
      }
      const scheduled = await this.prisma.gymOsMembership.findMany({
        where: { gymId: id, status: GymOsMembershipStatus.SCHEDULED, startDate: { lte: today } },
      });
      for (const m of scheduled) {
        if (
          await this.reconcileTransition(
            m,
            GymOsMembershipStatus.SCHEDULED,
            GymOsMembershipStatus.ACTIVE,
            GymOsMembershipEventType.ACTIVATED,
          )
        ) {
          activated++;
        }
      }
    }
    return { activated, expired };
  }
  private async listInternal(q: MembershipListDto) {
    const where: Prisma.GymOsMembershipWhereInput = {
      gymId: q.gymId,
      status: q.status,
      membershipPlanId: q.planId,
      memberId: q.memberId,
      branchIdsSnapshot: q.branchId ? { has: q.branchId } : undefined,
    };
    if (q.search)
      where.member = {
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' } },
          { lastName: { contains: q.search, mode: 'insensitive' } },
          { memberCode: { contains: q.search, mode: 'insensitive' } },
          { phone: { contains: q.search } },
        ],
      };
    if (q.expiryBucket) {
      const gym = q.gymId;
      if (!gym)
        return { data: [], meta: { page: q.page, limit: q.pageSize, total: 0, totalPages: 0 } };
      const today = await this.today(gym, this.prisma),
        range = this.bucket(q.expiryBucket, today);
      where.endDate = range;
    }
    const [data, total] = await Promise.all([
      this.prisma.gymOsMembership.findMany({
        where,
        include: {
          member: {
            select: { id: true, memberCode: true, firstName: true, lastName: true, phone: true },
          },
          membershipPlan: { select: { id: true, name: true } },
          gym: { select: { id: true, name: true } },
        },
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
        orderBy: { endDate: 'asc' },
      }),
      this.prisma.gymOsMembership.count({ where }),
    ]);
    const today = q.gymId
      ? await this.today(q.gymId, this.prisma)
      : this.date(new Date().toISOString().slice(0, 10));
    return {
      data: data.map((m) => ({
        ...m,
        daysRemaining: Math.round((m.endDate.getTime() - today.getTime()) / 86400000),
      })),
      meta: { page: q.page, limit: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
    };
  }
  private async transition(
    user: AuthUser,
    gymId: string,
    id: string,
    from: GymOsMembershipStatus,
    to: GymOsMembershipStatus,
    action: AuditAction,
    type: GymOsMembershipEventType,
    data: Prisma.GymOsMembershipUpdateInput,
    reason?: string,
  ) {
    await this.authorize(user, gymId, true);
    await this.requireFeature(gymId);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const m = await tx.gymOsMembership.findFirst({ where: { id, gymId } });
      if (!m) this.membershipMissing();
      if (to === GymOsMembershipStatus.FROZEN && m.status === GymOsMembershipStatus.FROZEN)
        this.fail(
          ApiErrorCode.GYMOS_MEMBERSHIP_ALREADY_FROZEN,
          'Membership is already frozen',
          HttpStatus.CONFLICT,
        );
      if (m.status !== from) this.invalid();
      const value = await tx.gymOsMembership.update({
        where: { id },
        data: { ...data, status: to, updatedBy: { connect: { id: user.id } } },
      });
      await this.event(tx, value, type, user.id, reason);
      await this.audit(tx, user.id, action, 'GymOsMembership', id, { gymId });
      return value;
    });
  }
  private async createCharge(
    tx: Prisma.TransactionClient,
    membership: {
      id: string;
      gymId: string;
      memberId: string;
      startDate: Date;
      planNameSnapshot: string;
      priceMinorSnapshot: number;
      currencySnapshot: string;
    },
    actorUserId: string,
    renewal: boolean,
  ) {
    const charge = await tx.gymOsMemberCharge.create({
      data: {
        gymId: membership.gymId,
        memberId: membership.memberId,
        membershipId: membership.id,
        type: renewal ? 'RENEWAL' : 'MEMBERSHIP',
        description: `${renewal ? 'Renewal' : 'Membership'} — ${membership.planNameSnapshot}`,
        amountMinor: membership.priceMinorSnapshot,
        currency: membership.currencySnapshot,
        dueDate: membership.startDate,
        status: membership.priceMinorSnapshot === 0 ? 'PAID' : 'UNPAID',
        createdByUserId: actorUserId,
      },
    });
    await this.audit(
      tx,
      actorUserId,
      AuditAction.GYMOS_MEMBER_CHARGE_CREATED,
      'GymOsMemberCharge',
      charge.id,
      { gymId: membership.gymId, membershipId: membership.id, renewal },
    );
  }
  private async requireFeature(gymId: string) {
    const e = await this.entitlements.getEffectiveEntitlements(gymId);
    if (!e.subscribed || !e.features.includes(GymOsFeature.MEMBERSHIP_MANAGEMENT))
      this.fail(
        ApiErrorCode.GYMOS_MEMBERSHIP_FEATURE_REQUIRED,
        'Active GymOS Membership Management entitlement required',
        HttpStatus.PAYMENT_REQUIRED,
      );
  }
  private authorize(user: AuthUser, gymId: string, write: boolean) {
    return write
      ? this.access.assertGymOsMemberWrite(user, gymId)
      : this.access.assertGymOsMemberRead(user, gymId);
  }
  private async branches(gymId: string, ids?: string[]) {
    if (!ids?.length) return;
    const count = await this.prisma.gymBranch.count({ where: { gymId, id: { in: ids } } });
    if (count !== new Set(ids).size)
      this.fail(
        ApiErrorCode.GYMOS_MEMBER_BRANCH_INVALID,
        'All plan branches must belong to the gym',
        HttpStatus.BAD_REQUEST,
      );
  }
  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    memberId: string,
    start: Date,
    end: Date,
    exclude?: string,
  ) {
    const overlap = await tx.gymOsMembership.findFirst({
      where: {
        memberId,
        id: exclude ? { not: exclude } : undefined,
        status: {
          in: [
            GymOsMembershipStatus.SCHEDULED,
            GymOsMembershipStatus.ACTIVE,
            GymOsMembershipStatus.FROZEN,
          ],
        },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlap)
      this.fail(
        ApiErrorCode.GYMOS_MEMBERSHIP_OVERLAP,
        'Membership period overlaps an open membership',
        HttpStatus.CONFLICT,
      );
  }
  private endDate(start: Date, type: GymOsMembershipDurationType, value: number) {
    const end = new Date(start);
    if (type === GymOsMembershipDurationType.DAYS) end.setUTCDate(end.getUTCDate() + value - 1);
    else if (type === GymOsMembershipDurationType.WEEKS)
      end.setUTCDate(end.getUTCDate() + value * 7 - 1);
    else {
      const day = end.getUTCDate();
      end.setUTCDate(1);
      end.setUTCMonth(end.getUTCMonth() + value);
      end.setUTCDate(
        Math.min(
          day,
          new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate(),
        ),
      );
      end.setUTCDate(end.getUTCDate() - 1);
    }
    return end;
  }
  private bucket(key: string, today: Date): Prisma.DateTimeFilter {
    if (key === 'EXPIRED') return { lt: today };
    if (key === 'TODAY') return { equals: today };
    const exact: { [k: string]: number } = { IN_1_DAY: 1, IN_2_DAYS: 2, IN_3_DAYS: 3 };
    if (key in exact) return { equals: this.addDays(today, exact[key]!) };
    if (key === 'WITHIN_7_DAYS') return { gte: today, lte: this.addDays(today, 7) };
    if (key === 'THIS_MONTH')
      return {
        gte: today,
        lte: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)),
      };
    return {};
  }
  private async today(gymId: string, db: Prisma.TransactionClient | PrismaService) {
    const branch = await db.gymBranch.findFirst({ where: { gymId }, select: { timezone: true } });
    const value = new Intl.DateTimeFormat('en-CA', {
      timeZone: branch?.timezone ?? 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return this.date(value);
  }
  private date(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()))
      this.fail(ApiErrorCode.VALIDATION_FAILED, 'Invalid membership date', HttpStatus.BAD_REQUEST);
    return date;
  }
  private addDays(date: Date, days: number) {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() + days);
    return value;
  }
  private iso(date: Date) {
    return date.toISOString().slice(0, 10);
  }
  private lock(tx: Prisma.TransactionClient, key: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
  private event(
    tx: Prisma.TransactionClient,
    m: { id: string; gymId: string; memberId: string },
    type: GymOsMembershipEventType,
    actor?: string,
    reason?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return tx.gymOsMembershipEvent.create({
      data: {
        membershipId: m.id,
        gymId: m.gymId,
        memberId: m.memberId,
        type,
        performedByUserId: actor,
        reason,
        metadata,
      },
    });
  }
  private audit(
    tx: Prisma.TransactionClient,
    actor: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: { actorUserId: actor, action, entityType, entityId, metadata },
    });
  }
  private reconcileTransition(
    m: { id: string; gymId: string; memberId: string },
    from: GymOsMembershipStatus,
    to: GymOsMembershipStatus,
    type: GymOsMembershipEventType,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.gymOsMembership.updateMany({
        where: { id: m.id, status: from },
        data: {
          status: to,
          expiredAt: to === GymOsMembershipStatus.EXPIRED ? new Date() : undefined,
        },
      });
      if (!result.count) return false;
      await this.event(tx, m, type);
      const gym = await tx.gym.findUniqueOrThrow({
        where: { id: m.gymId },
        select: { ownerId: true },
      });
      await this.audit(
        tx,
        gym.ownerId,
        type === GymOsMembershipEventType.EXPIRED
          ? AuditAction.GYMOS_MEMBERSHIP_EXPIRED
          : AuditAction.GYMOS_MEMBERSHIP_CREATED,
        'GymOsMembership',
        m.id,
        { gymId: m.gymId, automated: true },
      );
      return true;
    });
  }
  private rethrow(e: unknown): never {
    if (e instanceof DomainException) throw e;
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      (e.code === 'P2002' || e.code === 'P2034')
    )
      this.fail(
        ApiErrorCode.GYMOS_MEMBERSHIP_OVERLAP,
        'Concurrent membership operation conflicted',
        HttpStatus.CONFLICT,
      );
    throw e;
  }
  private planMissing(): never {
    this.fail(
      ApiErrorCode.GYMOS_MEMBERSHIP_PLAN_NOT_FOUND,
      'Membership plan not found',
      HttpStatus.NOT_FOUND,
    );
  }
  private memberMissing(): never {
    this.fail(ApiErrorCode.GYMOS_MEMBER_NOT_FOUND, 'Member not found', HttpStatus.NOT_FOUND);
  }
  private membershipMissing(): never {
    this.fail(
      ApiErrorCode.GYMOS_MEMBERSHIP_NOT_FOUND,
      'Membership not found',
      HttpStatus.NOT_FOUND,
    );
  }
  private invalid(): never {
    this.fail(
      ApiErrorCode.GYMOS_MEMBERSHIP_INVALID_TRANSITION,
      'Invalid membership transition',
      HttpStatus.CONFLICT,
    );
  }
  private fail(code: ApiErrorCode, message: string, status: HttpStatus): never {
    throw new DomainException(code, message, status);
  }
}
