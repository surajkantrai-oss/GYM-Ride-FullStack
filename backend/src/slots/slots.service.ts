import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BookingStatus,
  BranchStatus,
  GymStatus,
  PlanStatus,
  SlotStatus,
  Weekday,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { AvailabilityExceptionDto, SlotConfigDto } from './dto/slot.dto';
import { generateSlotRanges } from './slot-generation';

const weekday: Record<number, Weekday> = {
  1: Weekday.MONDAY,
  2: Weekday.TUESDAY,
  3: Weekday.WEDNESDAY,
  4: Weekday.THURSDAY,
  5: Weekday.FRIDAY,
  6: Weekday.SATURDAY,
  7: Weekday.SUNDAY,
};

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
  ) {}

  async getConfig(user: AuthUser, branchId: string): Promise<unknown> {
    await this.access.assertBranchManagement(user, branchId);
    return this.prisma.branchSlotConfig.findUnique({ where: { branchId } });
  }

  async putConfig(user: AuthUser, branchId: string, dto: SlotConfigDto): Promise<unknown> {
    await this.access.assertBranchManagement(user, branchId);
    const config = await this.prisma.branchSlotConfig.upsert({
      where: { branchId },
      update: dto,
      create: { branchId, ...dto },
    });
    const now = new Date();
    await this.prisma.slotInstance.deleteMany({
      where: { branchId, startAt: { gt: now }, bookings: { none: {} } },
    });
    await this.ensureHorizon(branchId);
    return config;
  }

  async upsertException(
    user: AuthUser,
    branchId: string,
    dto: AvailabilityExceptionDto,
  ): Promise<unknown> {
    await this.access.assertBranchManagement(user, branchId);
    const branch = await this.prisma.gymBranch.findUnique({
      where: { id: branchId },
      select: { timezone: true },
    });
    if (!branch)
      throw new DomainException(
        ApiErrorCode.BRANCH_NOT_FOUND,
        'Branch not found',
        HttpStatus.NOT_FOUND,
      );
    const date = DateTime.fromISO(dto.date, { zone: 'utc' }).startOf('day').toJSDate();
    const local = DateTime.fromISO(dto.date, { zone: branch.timezone }).startOf('day');
    const value = await this.prisma.branchAvailabilityException.upsert({
      where: { branchId_date: { branchId, date } },
      update: { type: dto.type, reason: dto.reason, isClosed: dto.isClosed ?? true },
      create: {
        branchId,
        date,
        type: dto.type,
        reason: dto.reason,
        isClosed: dto.isClosed ?? true,
      },
    });
    await this.prisma.slotInstance.updateMany({
      where: {
        branchId,
        startAt: {
          gte: local.toUTC().toJSDate(),
          lt: local.plus({ days: 1 }).toUTC().toJSDate(),
        },
        bookings: { none: {} },
      },
      data: { status: value.isClosed ? SlotStatus.CLOSED : SlotStatus.AVAILABLE },
    });
    if (!value.isClosed) await this.ensureHorizon(branchId);
    return value;
  }

  async listExceptions(user: AuthUser, branchId: string): Promise<unknown[]> {
    await this.access.assertBranchManagement(user, branchId);
    const branch = await this.prisma.gymBranch.findUnique({
      where: { id: branchId },
      select: { timezone: true },
    });
    if (!branch)
      throw new DomainException(
        ApiErrorCode.BRANCH_NOT_FOUND,
        'Branch not found',
        HttpStatus.NOT_FOUND,
      );
    const today = DateTime.now().setZone(branch.timezone).startOf('day');
    return this.prisma.branchAvailabilityException.findMany({
      where: {
        branchId,
        date: { gte: DateTime.fromISO(today.toISODate()!, { zone: 'utc' }).toJSDate() },
      },
      orderBy: { date: 'asc' },
    });
  }

  async partnerAvailability(
    user: AuthUser,
    branchId: string,
    date: string,
    planId?: string,
  ): Promise<unknown[]> {
    await this.access.assertBranchManagement(user, branchId);
    return this.availability(branchId, date, planId, false);
  }
  async publicAvailability(branchId: string, date: string, planId?: string): Promise<unknown[]> {
    return this.availability(branchId, date, planId, true);
  }

  async ensureHorizon(branchId: string): Promise<void> {
    const branch = await this.prisma.gymBranch.findUnique({
      where: { id: branchId },
      select: { timezone: true, slotConfig: true, operatingHours: true, exceptions: true },
    });
    if (!branch?.slotConfig?.isActive) return;
    const start = DateTime.now().setZone(branch.timezone).startOf('day');
    for (let offset = 0; offset <= branch.slotConfig.bookingWindowDays; offset += 1) {
      const localDate = start.plus({ days: offset });
      const closed = branch.exceptions.some(
        (item) =>
          DateTime.fromJSDate(item.date, { zone: 'utc' }).toISODate() === localDate.toISODate() &&
          item.isClosed,
      );
      if (closed) continue;
      const hours = branch.operatingHours
        .filter(
          (item) =>
            item.weekday === weekday[localDate.weekday] &&
            !item.isClosed &&
            item.opensAt &&
            item.closesAt,
        )
        .map((item) => ({
          opensAt: this.clock(item.opensAt!),
          closesAt: this.clock(item.closesAt!),
        }));
      const ranges = generateSlotRanges(
        localDate.toISODate()!,
        branch.timezone,
        hours,
        branch.slotConfig.slotDurationMinutes,
      );
      if (ranges.length)
        await this.prisma.slotInstance.createMany({
          data: ranges.map((range) => ({
            branchId,
            ...range,
            capacity: branch.slotConfig!.defaultCapacity,
          })),
          skipDuplicates: true,
        });
    }
  }

  private async availability(
    branchId: string,
    date: string,
    planId: string | undefined,
    publicOnly: boolean,
  ): Promise<unknown[]> {
    const branch = await this.prisma.gymBranch.findUnique({
      where: { id: branchId },
      select: { status: true, gym: { select: { status: true } }, timezone: true, slotConfig: true },
    });
    if (
      !branch ||
      (publicOnly &&
        (branch.status !== BranchStatus.ACTIVE || branch.gym.status !== GymStatus.APPROVED))
    )
      throw new DomainException(
        ApiErrorCode.BRANCH_NOT_FOUND,
        'Branch not found',
        HttpStatus.NOT_FOUND,
      );
    if (planId) {
      const valid = await this.prisma.gymPlan.count({
        where: { id: planId, status: PlanStatus.ACTIVE, branches: { some: { branchId } } },
      });
      if (!valid)
        throw new DomainException(
          ApiErrorCode.PLAN_NOT_AVAILABLE_AT_BRANCH,
          'Plan is not available at this branch',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
    }
    await this.ensureHorizon(branchId);
    const local = DateTime.fromISO(date, { zone: branch.timezone });
    if (!local.isValid)
      throw new DomainException(
        ApiErrorCode.VALIDATION_FAILED,
        'Invalid date',
        HttpStatus.BAD_REQUEST,
      );
    const slots = await this.prisma.slotInstance.findMany({
      where: {
        branchId,
        startAt: {
          gte: local.startOf('day').toUTC().toJSDate(),
          lt: local.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
        },
      },
      orderBy: { startAt: 'asc' },
    });
    const now = new Date();
    const usage = slots.length
      ? await this.prisma.booking.groupBy({
          by: ['slotId', 'status'],
          where: {
            slotId: { in: slots.map((slot) => slot.id) },
            OR: [
              {
                status: {
                  in: [
                    BookingStatus.CONFIRMED,
                    BookingStatus.CHECK_IN_AVAILABLE,
                    BookingStatus.CHECKED_IN,
                  ],
                },
              },
              { status: BookingStatus.PAYMENT_PENDING, reservationExpiresAt: { gt: now } },
            ],
          },
          _count: { _all: true },
        })
      : [];
    return slots.map((slot) => {
      const reserved = usage
        .filter((row) => row.slotId === slot.id && row.status === BookingStatus.PAYMENT_PENDING)
        .reduce((sum, row) => sum + row._count._all, 0);
      const confirmed = usage
        .filter((row) => row.slotId === slot.id && row.status !== BookingStatus.PAYMENT_PENDING)
        .reduce((sum, row) => sum + row._count._all, 0);
      return {
        id: slot.id,
        startAt: slot.startAt,
        endAt: slot.endAt,
        capacity: slot.capacity,
        reserved,
        confirmed,
        available: Math.max(0, slot.capacity - reserved - confirmed),
        status: slot.status,
      };
    });
  }
  private clock(value: Date): string {
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }
}
