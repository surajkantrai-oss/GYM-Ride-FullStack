/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Injectable } from '@nestjs/common';
import { GymOsFeature } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import {
  GymOsAnalyticsRangeDto,
  GymOsAnalyticsRangeResolver,
  GymOsMemberSegment,
  GymOsSegmentDto,
} from './gym-os-analytics-range';
import { GymOsEntitlementService } from './gym-os-entitlement.service';

@Injectable()
export class GymOsAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
    private readonly entitlements: GymOsEntitlementService,
    private readonly ranges: GymOsAnalyticsRangeResolver,
  ) {}
  async overview(user: AuthUser, gymId: string, q = new GymOsAnalyticsRangeDto()) {
    await this.authorize(user, gymId);
    const period = await this.period(gymId, q);
    const [
      members,
      memberships,
      expiring,
      attendance,
      visitors,
      collections,
      dues,
      methods,
      attendanceAnalytics,
      branches,
      retention,
      segments,
    ] = await Promise.all([
      this.prisma.gymMember.count({ where: { gymId, status: 'ACTIVE' } }),
      this.prisma.gymOsMembership.groupBy({ by: ['status'], where: { gymId }, _count: true }),
      this.prisma.gymOsMembership.count({
        where: { gymId, status: 'ACTIVE', endDate: { gte: period.from, lt: period.toExclusive } },
      }),
      this.prisma.gymOsAttendance.count({
        where: { gymId, checkInAt: { gte: period.from, lt: period.toExclusive } },
      }),
      this.prisma.gymOsAttendance.groupBy({
        by: ['memberId'],
        where: { gymId, checkInAt: { gte: period.from, lt: period.toExclusive } },
      }),
      this.prisma.gymOsMemberPayment.aggregate({
        _sum: { amountMinor: true },
        where: { gymId, status: 'RECORDED', paidAt: { gte: period.from, lt: period.toExclusive } },
      }),
      this.dues(gymId, period.toExclusive),
      this.prisma.gymOsMemberPayment.groupBy({
        by: ['method'],
        where: { gymId, status: 'RECORDED', paidAt: { gte: period.from, lt: period.toExclusive } },
        _sum: { amountMinor: true },
        _count: true,
      }),
      this.attendanceInternal(gymId, period),
      this.branchesInternal(gymId, period),
      this.retentionInternal(gymId, period),
      this.segmentsInternal(gymId, GymOsMemberSegment.NO_VISIT_7_DAYS, 100, period.toExclusive),
    ]);
    const status = Object.fromEntries(memberships.map((x) => [x.status, x._count])),
      money = dues[0] ?? { outstanding: 0n, overdue: 0n };
    return {
      period,
      activeMembers: members,
      activeMemberships: status.ACTIVE ?? 0,
      scheduledMemberships: status.SCHEDULED ?? 0,
      frozenMemberships: status.FROZEN ?? 0,
      expiredMemberships: status.EXPIRED ?? 0,
      cancelledMemberships: status.CANCELLED ?? 0,
      expiringInRange: expiring,
      expiringIn7Days: expiring,
      renewalsThisMonth: retention.renewedMemberships,
      attendanceInRange: attendance,
      todayAttendance: attendance,
      uniqueVisitors: visitors.length,
      uniqueVisitors30Days: visitors.length,
      collectionsMinor: collections._sum.amountMinor ?? 0,
      collectionsThisMonthMinor: collections._sum.amountMinor ?? 0,
      outstandingMinor: Number(money.outstanding),
      overdueMinor: Number(money.overdue),
      paymentMethods: methods,
      attendance: attendanceAnalytics,
      branches,
      retention,
      segments,
      branchAttributionAvailable: {
        attendance: true,
        activeMembers: true,
        membershipExpiries: 'single-branch-memberships-only',
        finance: false,
      },
    };
  }
  async renewals(user: AuthUser, gymId: string, q = new GymOsAnalyticsRangeDto()) {
    await this.authorize(user, gymId);
    return this.retentionInternal(gymId, await this.period(gymId, q));
  }
  async attendance(user: AuthUser, gymId: string, q = new GymOsAnalyticsRangeDto()) {
    await this.authorize(user, gymId);
    return this.attendanceInternal(gymId, await this.period(gymId, q));
  }
  async branches(user: AuthUser, gymId: string, q = new GymOsAnalyticsRangeDto()) {
    await this.authorize(user, gymId);
    const period = await this.period(gymId, q);
    return {
      period,
      branchAttributionAvailable: {
        collections: false,
        outstanding: false,
        reason: 'Member charges and payments have no authoritative branch key.',
      },
      items: await this.branchesInternal(gymId, period),
    };
  }
  async segments(user: AuthUser, gymId: string, q = new GymOsSegmentDto()) {
    await this.authorize(user, gymId);
    const period = await this.period(gymId, q);
    return {
      period,
      segment: q.segment,
      items: await this.segmentsInternal(gymId, q.segment, q.limit, period.toExclusive),
    };
  }
  private async attendanceInternal(
    gymId: string,
    p: { from: Date; toExclusive: Date; timezone: string },
  ) {
    const [daily, weekday, hour, memberVisits, activeCount] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ day: Date; visits: number; unique_visitors: number }>
      >`SELECT date_trunc('day',check_in_at AT TIME ZONE ${p.timezone}) AS "day",count(*)::int visits,count(DISTINCT member_id)::int unique_visitors FROM gym_os_attendances WHERE gym_id=${gymId}::uuid AND check_in_at>=${p.from} AND check_in_at<${p.toExclusive} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<
        Array<{ weekday: number; count: number }>
      >`SELECT EXTRACT(ISODOW FROM check_in_at AT TIME ZONE ${p.timezone})::int AS "weekday",count(*)::int count FROM gym_os_attendances WHERE gym_id=${gymId}::uuid AND check_in_at>=${p.from} AND check_in_at<${p.toExclusive} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<
        Array<{ hour: number; count: number }>
      >`SELECT EXTRACT(HOUR FROM check_in_at AT TIME ZONE ${p.timezone})::int AS "hour",count(*)::int count FROM gym_os_attendances WHERE gym_id=${gymId}::uuid AND check_in_at>=${p.from} AND check_in_at<${p.toExclusive} GROUP BY 1 ORDER BY 1`,
      this.prisma.gymOsAttendance.groupBy({
        by: ['memberId'],
        where: { gymId, checkInAt: { gte: p.from, lt: p.toExclusive } },
        _count: true,
      }),
      this.prisma.gymOsMembership.groupBy({ by: ['memberId'], where: { gymId, status: 'ACTIVE' } }),
    ]);
    const counts = memberVisits.map((x) => x._count),
      withVisits = memberVisits.length,
      zero = Math.max(0, activeCount.length - withVisits),
      sum = counts.reduce((a, b) => a + b, 0),
      bucket = (min: number, max = Infinity) => counts.filter((x) => x >= min && x <= max).length;
    return {
      daily,
      attendanceByWeekday: weekday,
      attendanceByHour: hour,
      busiestDayOfWeek:
        weekday.reduce(
          (a, b) => (b.count > (a?.count ?? -1) ? b : a),
          undefined as (typeof weekday)[number] | undefined,
        ) ?? null,
      busiestHour:
        hour.reduce(
          (a, b) => (b.count > (a?.count ?? -1) ? b : a),
          undefined as (typeof hour)[number] | undefined,
        ) ?? null,
      averageVisitsPerMember: activeCount.length
        ? Math.round((sum / activeCount.length) * 100) / 100
        : 0,
      activeMembersWithVisits: withVisits,
      zeroVisitActiveMembers: zero,
      frequency: {
        zero,
        oneToTwo: bucket(1, 2),
        threeToFive: bucket(3, 5),
        sixToEleven: bucket(6, 11),
        twelvePlus: bucket(12),
      },
    };
  }
  private async retentionInternal(gymId: string, p: { from: Date; toExclusive: Date }) {
    const ended = await this.prisma.gymOsMembership.findMany({
        where: {
          gymId,
          endDate: { gte: p.from, lt: p.toExclusive },
          status: 'EXPIRED',
        },
        select: { id: true, endDate: true, renewedTo: { select: { id: true, startDate: true } } },
      }),
      renewed = ended.filter((x) => x.renewedTo),
      pre = renewed.filter((x) => x.renewedTo!.startDate <= x.endDate),
      post = renewed.filter((x) => x.renewedTo!.startDate > x.endDate),
      days = renewed.map((x) =>
        Math.round((x.renewedTo!.startDate.getTime() - x.endDate.getTime()) / 86400000),
      ),
      first = await this.prisma.gymOsMembership.count({
        where: {
          gymId,
          renewedFromMembershipId: null,
          createdAt: { gte: p.from, lt: p.toExclusive },
        },
      }),
      repeat = await this.prisma.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int count FROM(SELECT member_id FROM gym_os_memberships WHERE gym_id=${gymId}::uuid GROUP BY member_id HAVING count(*)>=3 AND count(renewed_from_membership_id)>=2)x`;
    return {
      eligibleExpiries: ended.length,
      renewed: renewed.length,
      renewedMemberships: renewed.length,
      renewalRate: ended.length ? Math.round((renewed.length * 10000) / ended.length) / 100 : 0,
      formula: 'renewed eligible memberships / memberships ending in selected cohort',
      firstTimeMemberships: first,
      repeatRenewalMembers: repeat[0]?.count ?? 0,
      preExpiryRenewals: pre.length,
      postExpiryRenewals: post.length,
      averageDaysToRenewal: days.length
        ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 100) / 100
        : null,
    };
  }
  private segmentsInternal(gymId: string, segment: GymOsMemberSegment, limit: number, asOf: Date) {
    const days = segment.includes('30') ? 30 : segment.includes('14') ? 14 : 7,
      cutoff = new Date(asOf.getTime() - days * 86400000),
      newOnly = segment === GymOsMemberSegment.NEW_MEMBER_NO_VISIT_7_DAYS;
    return this.prisma.$queryRaw<
      Array<{
        id: string;
        member_code: string;
        first_name: string;
        last_name: string | null;
        membership_id: string;
        start_date: Date;
        last_visit: Date | null;
        days_inactive: number;
        attendance_count: number;
      }>
    >`SELECT m.id,m.member_code,m.first_name,m.last_name,ms.id membership_id,ms.start_date,MAX(a.check_in_at) last_visit,EXTRACT(day FROM ${asOf}-COALESCE(MAX(a.check_in_at),ms.start_date::timestamp))::int days_inactive,count(a.id)::int attendance_count FROM gym_members m JOIN gym_os_memberships ms ON ms.member_id=m.id AND ms.status='ACTIVE' LEFT JOIN gym_os_attendances a ON a.member_id=m.id AND a.check_in_at>=ms.start_date WHERE m.gym_id=${gymId}::uuid AND m.status='ACTIVE' GROUP BY m.id,ms.id HAVING (${newOnly} AND count(a.id)=0 AND ms.start_date<=${cutoff}) OR (${!newOnly} AND COALESCE(MAX(a.check_in_at),ms.start_date::timestamp)<=${cutoff}) ORDER BY days_inactive DESC LIMIT ${limit}`;
  }
  private branchesInternal(gymId: string, p: { from: Date; toExclusive: Date }) {
    return this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        active_members: number;
        visits: number;
        unique_visitors: number;
        average_visits_per_member: number;
        expiring_memberships: number;
      }>
    >`SELECT b.id,b.name,count(DISTINCT m.id)::int active_members,count(DISTINCT a.id)::int visits,count(DISTINCT a.member_id)::int unique_visitors,CASE WHEN count(DISTINCT m.id)=0 THEN 0 ELSE round(count(DISTINCT a.id)::numeric/count(DISTINCT m.id),2) END average_visits_per_member,count(DISTINCT CASE WHEN cardinality(ms.branch_ids_snapshot)=1 AND ms.end_date>=${p.from} AND ms.end_date<${p.toExclusive} THEN ms.id END)::int expiring_memberships FROM gym_branches b LEFT JOIN gym_members m ON m.primary_branch_id=b.id AND m.status='ACTIVE' LEFT JOIN gym_os_attendances a ON a.branch_id=b.id AND a.check_in_at>=${p.from} AND a.check_in_at<${p.toExclusive} LEFT JOIN gym_os_memberships ms ON ms.member_id=m.id AND ms.status='ACTIVE' WHERE b.gym_id=${gymId}::uuid GROUP BY b.id,b.name ORDER BY b.name`;
  }
  private dues(gymId: string, asOf: Date) {
    return this.prisma.$queryRaw<
      Array<{ outstanding: bigint; overdue: bigint }>
    >`SELECT COALESCE(SUM(GREATEST(c.amount_minor-COALESCE(a.paid,0),0)),0)::bigint outstanding,COALESCE(SUM(CASE WHEN c.due_date<${asOf} THEN GREATEST(c.amount_minor-COALESCE(a.paid,0),0) ELSE 0 END),0)::bigint overdue FROM gym_os_member_charges c LEFT JOIN(SELECT pa.charge_id,SUM(pa.amount_minor) paid FROM gym_os_payment_allocations pa JOIN gym_os_member_payments p ON p.id=pa.payment_id AND p.status='RECORDED' GROUP BY pa.charge_id)a ON a.charge_id=c.id WHERE c.gym_id=${gymId}::uuid AND c.status<>'VOID'`;
  }
  private async period(gymId: string, q: GymOsAnalyticsRangeDto) {
    const b = await this.prisma.gymBranch.findFirst({
      where: { gymId },
      select: { timezone: true },
    });
    return this.ranges.resolve(b?.timezone ?? 'Asia/Kolkata', q);
  }
  private async authorize(user: AuthUser, gymId: string) {
    await this.access.assertGymOsMemberRead(user, gymId);
    const e = await this.entitlements.getEffectiveEntitlements(gymId);
    if (!e.subscribed || !e.features.includes(GymOsFeature.REPORTS))
      throw new DomainException(
        ApiErrorCode.GYMOS_ANALYTICS_FEATURE_REQUIRED,
        'GymOS Reports entitlement required',
        HttpStatus.PAYMENT_REQUIRED,
      );
  }
}
