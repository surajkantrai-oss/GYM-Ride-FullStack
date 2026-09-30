/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  BranchStatus,
  GymMemberStatus,
  GymOsAttendanceMethod,
  GymOsAttendanceStatus,
  GymOsFeature,
  GymOsMembershipStatus,
  Prisma,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { AttendanceCheckInDto, AttendanceListDto } from './gym-os-attendance.dto';
import { GymOsEntitlementService } from './gym-os-entitlement.service';
import { GymOsMembershipService } from './gym-os-membership.service';

@Injectable()
export class GymOsAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
    private readonly entitlements: GymOsEntitlementService,
    private readonly memberships: GymOsMembershipService,
    private readonly config: ConfigService,
  ) {}

  async checkIn(user: AuthUser, gymId: string, dto: AttendanceCheckInDto) {
    await this.authorizeBranch(user, gymId, dto.branchId);
    await this.requireFeature(gymId);
    await this.memberships.reconcile(gymId);
    return this.createAttendance(user, gymId, dto, GymOsAttendanceMethod.MANUAL);
  }

  async qrToken(user: AuthUser, gymId: string, branchId: string) {
    await this.authorizeBranch(user, gymId, branchId);
    await this.requireFeature(gymId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get<number>('GYMOS_ATTENDANCE_QR_TTL_SECONDS', 60) * 1000,
    );
    const record = await this.prisma.gymOsAttendanceQrToken.create({
      data: { gymId, branchId, tokenHash: this.hash(token), expiresAt },
    });
    return { token: `${record.id}.${token}`, expiresAt, branchId };
  }

  async qrCheckIn(user: AuthUser, gymId: string, dto: AttendanceCheckInDto & { token: string }) {
    await this.authorizeBranch(user, gymId, dto.branchId);
    await this.requireFeature(gymId);
    await this.memberships.reconcile(gymId);
    const [id, secret] = dto.token.split('.');
    if (!id || !secret)
      this.fail(
        ApiErrorCode.GYMOS_ATTENDANCE_QR_INVALID,
        'Invalid attendance QR',
        HttpStatus.BAD_REQUEST,
      );
    const token = await this.prisma.gymOsAttendanceQrToken.findFirst({
      where: { id, gymId, branchId: dto.branchId },
    });
    if (!token || !this.matchesHash(token.tokenHash, secret))
      this.fail(
        ApiErrorCode.GYMOS_ATTENDANCE_QR_INVALID,
        'Invalid attendance QR',
        HttpStatus.BAD_REQUEST,
      );
    if (token.status === 'REVOKED')
      this.fail(
        ApiErrorCode.GYMOS_ATTENDANCE_QR_REVOKED,
        'Attendance QR was revoked',
        HttpStatus.CONFLICT,
      );
    if (token.expiresAt <= new Date())
      this.fail(ApiErrorCode.GYMOS_ATTENDANCE_QR_EXPIRED, 'Attendance QR expired', HttpStatus.GONE);
    return this.createAttendance(user, gymId, dto, GymOsAttendanceMethod.QR, token.id);
  }

  async checkOut(user: AuthUser, gymId: string, attendanceId: string) {
    await this.access.assertGymOsMemberRead(user, gymId);
    await this.requireFeature(gymId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${attendanceId}))`;
      const attendance = await tx.gymOsAttendance.findFirst({ where: { id: attendanceId, gymId } });
      if (!attendance)
        this.fail(
          ApiErrorCode.GYMOS_ATTENDANCE_NOT_CHECKED_IN,
          'Open attendance not found',
          HttpStatus.NOT_FOUND,
        );
      await this.authorizeBranch(user, gymId, attendance.branchId);
      if (attendance.checkOutAt)
        this.fail(
          ApiErrorCode.GYMOS_ATTENDANCE_ALREADY_CHECKED_OUT,
          'Attendance is already checked out',
          HttpStatus.CONFLICT,
        );
      const value = await tx.gymOsAttendance.update({
        where: { id: attendanceId },
        data: {
          status: GymOsAttendanceStatus.CHECKED_OUT,
          checkOutAt: new Date(),
          checkOutMethod: GymOsAttendanceMethod.MANUAL,
        },
      });
      await this.audit(tx, user.id, AuditAction.GYMOS_ATTENDANCE_CHECKED_OUT, value.id, {
        gymId,
        branchId: value.branchId,
        memberId: value.memberId,
      });
      return this.response(value);
    });
  }

  async list(user: AuthUser, gymId: string, query: AttendanceListDto) {
    await this.access.assertGymOsMemberRead(user, gymId);
    await this.requireFeature(gymId);
    const branchId = await this.scopedBranch(user, gymId, query.branchId);
    return this.listInternal({ ...query, gymId, branchId });
  }
  async present(user: AuthUser, gymId: string, branchId?: string) {
    return this.list(user, gymId, {
      page: 1,
      pageSize: 100,
      status: GymOsAttendanceStatus.CHECKED_IN,
      branchId,
    });
  }
  async memberHistory(user: AuthUser, gymId: string, memberId: string, query: AttendanceListDto) {
    await this.access.assertGymOsMemberRead(user, gymId);
    await this.requireFeature(gymId);
    const member = await this.prisma.gymMember.findFirst({
      where: { id: memberId, gymId },
      select: { id: true },
    });
    if (!member) this.memberMissing();
    return this.listInternal({
      ...query,
      gymId,
      memberId,
      branchId: await this.scopedBranch(user, gymId, query.branchId),
    });
  }
  async summary(user: AuthUser, gymId: string, branchId?: string) {
    await this.access.assertGymOsMemberRead(user, gymId);
    await this.requireFeature(gymId);
    const scope = await this.scopedBranch(user, gymId, branchId);
    return this.summaryInternal(gymId, scope);
  }
  adminList(query: AttendanceListDto) {
    return this.listInternal(query);
  }
  adminSummary(gymId: string, branchId?: string) {
    return this.summaryInternal(gymId, branchId);
  }
  async cleanup() {
    const cutoff = new Date(
      Date.now() - this.config.get<number>('GYMOS_ATTENDANCE_QR_RETENTION_HOURS', 24) * 3600000,
    );
    return this.prisma.gymOsAttendanceQrToken.deleteMany({
      where: { expiresAt: { lt: cutoff }, attendances: { none: {} } },
    });
  }

  private async createAttendance(
    user: AuthUser,
    gymId: string,
    dto: AttendanceCheckInDto,
    method: GymOsAttendanceMethod,
    qrTokenId?: string,
  ) {
    return this.prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.memberId}))`;
          const branch = await tx.gymBranch.findFirst({
            where: { id: dto.branchId, gymId, status: BranchStatus.ACTIVE },
          });
          if (!branch)
            this.fail(
              ApiErrorCode.GYMOS_ATTENDANCE_BRANCH_NOT_ALLOWED,
              'Branch is not available',
              HttpStatus.FORBIDDEN,
            );
          const member = await tx.gymMember.findFirst({ where: { id: dto.memberId, gymId } });
          if (!member) this.memberMissing();
          if (member.status !== GymMemberStatus.ACTIVE)
            this.fail(
              ApiErrorCode.GYMOS_ATTENDANCE_MEMBER_NOT_FOUND,
              'Member is not active',
              HttpStatus.CONFLICT,
            );
          const membership = await tx.gymOsMembership.findFirst({
            where: {
              gymId,
              memberId: member.id,
              status: { in: [GymOsMembershipStatus.ACTIVE, GymOsMembershipStatus.FROZEN] },
            },
            orderBy: { startDate: 'desc' },
          });
          if (!membership)
            this.fail(
              ApiErrorCode.GYMOS_ATTENDANCE_MEMBERSHIP_REQUIRED,
              'Active membership required',
              HttpStatus.CONFLICT,
            );
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${membership.id}))`;
          if (membership.status === GymOsMembershipStatus.FROZEN)
            this.fail(
              ApiErrorCode.GYMOS_ATTENDANCE_MEMBERSHIP_FROZEN,
              'Membership is frozen',
              HttpStatus.CONFLICT,
            );
          const today = this.localDate(branch.timezone);
          if (membership.startDate > today || membership.endDate < today)
            this.fail(
              ApiErrorCode.GYMOS_ATTENDANCE_MEMBERSHIP_EXPIRED,
              'Membership is outside its valid dates',
              HttpStatus.CONFLICT,
            );
          if (
            membership.branchIdsSnapshot.length &&
            !membership.branchIdsSnapshot.includes(branch.id)
          )
            this.fail(
              ApiErrorCode.GYMOS_ATTENDANCE_BRANCH_NOT_ALLOWED,
              'Membership is not valid at this branch',
              HttpStatus.FORBIDDEN,
            );
          if (
            await tx.gymOsAttendance.findFirst({ where: { memberId: member.id, checkOutAt: null } })
          )
            this.fail(
              ApiErrorCode.GYMOS_ATTENDANCE_ALREADY_CHECKED_IN,
              'Member is already checked in',
              HttpStatus.CONFLICT,
            );
          const value = await tx.gymOsAttendance.create({
            data: {
              gymId,
              branchId: branch.id,
              memberId: member.id,
              membershipId: membership.id,
              checkInMethod: method,
              recordedByUserId: user.id,
              qrTokenId,
              manualReason: dto.reason,
            },
          });
          await this.audit(tx, user.id, AuditAction.GYMOS_ATTENDANCE_CHECKED_IN, value.id, {
            gymId,
            branchId: value.branchId,
            memberId: value.memberId,
            method,
          });
          return this.response(value);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error) => {
        if (error instanceof DomainException) throw error;
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        )
          this.fail(
            ApiErrorCode.GYMOS_ATTENDANCE_ALREADY_CHECKED_IN,
            'Concurrent check-in conflict',
            HttpStatus.CONFLICT,
          );
        throw error;
      });
  }

  private async listInternal(query: AttendanceListDto & { gymId?: string }) {
    const where: Prisma.GymOsAttendanceWhereInput = {
      gymId: query.gymId,
      branchId: query.branchId,
      memberId: query.memberId,
      status: query.status,
      checkInMethod: query.method,
    };
    if (query.search)
      where.member = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { memberCode: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      };
    if (query.dateFrom || query.dateTo)
      where.checkInAt = {
        gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
        lte: query.dateTo ? new Date(`${query.dateTo.slice(0, 10)}T23:59:59.999Z`) : undefined,
      };
    const [data, total] = await Promise.all([
      this.prisma.gymOsAttendance.findMany({
        where,
        include: {
          member: {
            select: { id: true, memberCode: true, firstName: true, lastName: true, phone: true },
          },
          branch: { select: { id: true, name: true, timezone: true } },
          membership: { select: { id: true, planNameSnapshot: true } },
          gym: { select: { id: true, name: true } },
        },
        orderBy: { checkInAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.gymOsAttendance.count({ where }),
    ]);
    return {
      data: data.map((x) => this.response(x)),
      meta: {
        page: query.page,
        limit: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
  private async summaryInternal(gymId: string, branchId?: string) {
    const branch = await this.prisma.gymBranch.findFirst({
      where: { gymId, id: branchId },
      select: { timezone: true },
    });
    const [start, end] = this.dayRange(branch?.timezone ?? 'Asia/Kolkata');
    const base = { gymId, branchId };
    const [
      todayCheckIns,
      currentlyPresent,
      checkOutsToday,
      unique,
      last7DaysCount,
      last30DaysCount,
    ] = await Promise.all([
      this.prisma.gymOsAttendance.count({ where: { ...base, checkInAt: { gte: start, lt: end } } }),
      this.prisma.gymOsAttendance.count({ where: { ...base, checkOutAt: null } }),
      this.prisma.gymOsAttendance.count({
        where: { ...base, checkOutAt: { gte: start, lt: end } },
      }),
      this.prisma.gymOsAttendance.groupBy({
        by: ['memberId'],
        where: { ...base, checkInAt: { gte: start, lt: end } },
      }),
      this.prisma.gymOsAttendance.count({
        where: { ...base, checkInAt: { gte: new Date(start.getTime() - 6 * 86400000), lt: end } },
      }),
      this.prisma.gymOsAttendance.count({
        where: { ...base, checkInAt: { gte: new Date(start.getTime() - 29 * 86400000), lt: end } },
      }),
    ]);
    return {
      todayCheckIns,
      currentlyPresent,
      checkOutsToday,
      uniqueMembersToday: unique.length,
      last7DaysCount,
      last30DaysCount,
    };
  }
  private response<T extends { checkInAt: Date; checkOutAt: Date | null }>(value: T) {
    return {
      ...value,
      durationMinutes: value.checkOutAt
        ? Math.max(0, Math.floor((value.checkOutAt.getTime() - value.checkInAt.getTime()) / 60000))
        : Math.max(0, Math.floor((Date.now() - value.checkInAt.getTime()) / 60000)),
    };
  }
  private async requireFeature(gymId: string) {
    const value = await this.entitlements.getEffectiveEntitlements(gymId);
    if (!value.subscribed || !value.features.includes(GymOsFeature.ATTENDANCE))
      this.fail(
        ApiErrorCode.GYMOS_ATTENDANCE_FEATURE_REQUIRED,
        'Active GymOS Attendance entitlement required',
        HttpStatus.PAYMENT_REQUIRED,
      );
  }
  private async authorizeBranch(user: AuthUser, gymId: string, branchId: string) {
    const branch = await this.access.assertBranchCheckIn(user, branchId);
    if (branch.gymId !== gymId)
      this.fail(
        ApiErrorCode.GYMOS_ATTENDANCE_FORBIDDEN,
        'Attendance access forbidden',
        HttpStatus.FORBIDDEN,
      );
  }
  private async scopedBranch(user: AuthUser, gymId: string, requested?: string) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: { ownerId: true },
    });
    if (!gym)
      this.fail(
        ApiErrorCode.GYMOS_ATTENDANCE_FORBIDDEN,
        'Attendance access forbidden',
        HttpStatus.FORBIDDEN,
      );
    if (this.access.isAdmin(user) || gym.ownerId === user.id) return requested;
    const membership = await this.prisma.gymMembership.findFirst({
      where: { userId: user.id, gymId, status: 'ACTIVE', role: { in: ['MANAGER', 'STAFF'] } },
      select: { branchId: true },
    });
    if (!membership)
      this.fail(
        ApiErrorCode.GYMOS_ATTENDANCE_FORBIDDEN,
        'Attendance access forbidden',
        HttpStatus.FORBIDDEN,
      );
    if (membership.branchId && requested && membership.branchId !== requested)
      this.fail(
        ApiErrorCode.GYMOS_ATTENDANCE_FORBIDDEN,
        'Branch attendance access forbidden',
        HttpStatus.FORBIDDEN,
      );
    return membership.branchId ?? requested;
  }
  private dayRange(timeZone: string) {
    const today = DateTime.now().setZone(timeZone).startOf('day');
    if (!today.isValid)
      this.fail(
        ApiErrorCode.GYMOS_ATTENDANCE_BRANCH_NOT_ALLOWED,
        'Branch timezone is invalid',
        HttpStatus.CONFLICT,
      );
    return [today.toUTC().toJSDate(), today.plus({ days: 1 }).toUTC().toJSDate()] as const;
  }
  private localDate(timeZone: string) {
    const value = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return new Date(`${value}T00:00:00.000Z`);
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  private matchesHash(expected: string, value: string) {
    const actual = this.hash(value);
    return (
      expected.length === actual.length &&
      timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'))
    );
  }
  private memberMissing(): never {
    this.fail(
      ApiErrorCode.GYMOS_ATTENDANCE_MEMBER_NOT_FOUND,
      'Member not found',
      HttpStatus.NOT_FOUND,
    );
  }
  private audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    action: AuditAction,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: { actorUserId, action, entityType: 'GymOsAttendance', entityId, metadata },
    });
  }
  private fail(code: ApiErrorCode, message: string, status: HttpStatus): never {
    throw new DomainException(code, message, status);
  }
}
