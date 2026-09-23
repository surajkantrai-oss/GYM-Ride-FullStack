import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingEventType,
  BookingStatus,
  BranchStatus,
  GymStatus,
  PlanStatus,
  PlanType,
  Prisma,
  SlotStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { pageMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { BookingLockService } from './booking-lock.service';
import { BookingListDto, CreateBookingDto, ManagedBookingListDto } from './dto/booking.dto';
import { ReservationExpirationService } from './reservation-expiration.service';
import { CheckInService } from '../check-ins/check-in.service';

const consumingStatuses = [
  BookingStatus.CONFIRMED,
  BookingStatus.CHECK_IN_AVAILABLE,
  BookingStatus.CHECKED_IN,
];
export const bookingSelect = {
  id: true,
  userId: true,
  gymId: true,
  branchId: true,
  planId: true,
  slotId: true,
  status: true,
  planName: true,
  planType: true,
  priceMinor: true,
  currency: true,
  reservationExpiresAt: true,
  cancelledAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  source: true,
  flexSubscriptionId: true,
  flexCityId: true,
  customerChargeMinor: true,
  reimbursementMinor: true,
  reimbursementCurrency: true,
  user: { select: { id: true, firstName: true, lastName: true } },
  gym: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, city: true, timezone: true } },
  payment: {
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      refundedAmount: true,
      refunds: { select: { id: true, amount: true, status: true, createdAt: true } },
    },
  },
  slot: { select: { id: true, startAt: true, endAt: true } },
  events: {
    select: { id: true, type: true, fromStatus: true, toStatus: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
  checkIn: {
    select: {
      id: true,
      status: true,
      method: true,
      verifiedAt: true,
      completedAt: true,
      verifiedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  review: { select: { id: true, rating: true, title: true, comment: true, status: true, createdAt: true, editedAt: true } },
  flexUsage: { select: { id: true, status: true, usageDate: true, consumedAt: true } },
} satisfies Prisma.BookingSelect;
type BookingView = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly ttlSeconds: number;
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
    private readonly locks: BookingLockService,
    private readonly expiration: ReservationExpirationService,
    config: ConfigService,
    @Optional() private readonly checkIns?: CheckInService,
  ) {
    this.ttlSeconds = config.get<number>('BOOKING_RESERVATION_TTL_SECONDS', 600);
  }

  async create(
    user: AuthUser,
    dto: CreateBookingDto,
    idempotencyKey: string,
  ): Promise<BookingView> {
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({ branchId: dto.branchId, planId: dto.planId, slotId: dto.slotId ?? null }),
      )
      .digest('hex');
    const prior = await this.prisma.booking.findUnique({
      where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
      select: { id: true, requestFingerprint: true },
    });
    if (prior) return this.resolvePrior(prior, fingerprint);
    const operation = (): Promise<BookingView> =>
      this.createTransaction(user.id, dto, idempotencyKey, fingerprint);
    try {
      const booking = dto.slotId
        ? await this.locks.withSlotLock(dto.slotId, operation)
        : await operation();
      if (booking.reservationExpiresAt) {
        try {
          await this.expiration.schedule(booking.id, booking.reservationExpiresAt);
        } catch (error) {
          this.logger.warn(
            { bookingId: booking.id, error: error instanceof Error ? error.message : 'unknown' },
            'Expiration scheduling failed; deadline-aware capacity fallback remains active',
          );
        }
      }
      this.logger.log(
        { bookingId: booking.id, slotId: booking.slotId },
        'Booking reservation created',
      );
      return booking;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.booking.findUnique({
          where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
          select: { id: true, requestFingerprint: true },
        });
        if (existing) return this.resolvePrior(existing, fingerprint);
      }
      throw error;
    }
  }

  private async createTransaction(
    userId: string,
    dto: CreateBookingDto,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<BookingView> {
    return this.prisma.$transaction(async (tx) => {
      if (dto.slotId)
        await tx.$queryRaw`SELECT id FROM slot_instances WHERE id = ${dto.slotId}::uuid FOR UPDATE`;
      const plan = await tx.gymPlan.findUnique({
        where: { id: dto.planId },
        include: { gym: true, branches: true },
      });
      if (!plan) this.fail(ApiErrorCode.PLAN_NOT_FOUND, 'Plan not found', HttpStatus.NOT_FOUND);
      if (plan.status !== PlanStatus.ACTIVE)
        this.fail(ApiErrorCode.PLAN_INACTIVE, 'Plan is not active', HttpStatus.CONFLICT);
      if (plan.gym.status !== GymStatus.APPROVED)
        this.fail(ApiErrorCode.PLAN_INACTIVE, 'Gym is not approved', HttpStatus.CONFLICT);
      if (!plan.branches.some((item) => item.branchId === dto.branchId))
        this.fail(
          ApiErrorCode.PLAN_NOT_AVAILABLE_AT_BRANCH,
          'Plan is not available at this branch',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      const branch = await tx.gymBranch.findUnique({
        where: { id: dto.branchId },
        include: { slotConfig: true },
      });
      if (!branch || branch.gymId !== plan.gymId || branch.status !== BranchStatus.ACTIVE)
        this.fail(ApiErrorCode.BRANCH_NOT_FOUND, 'Active branch not found', HttpStatus.NOT_FOUND);
      let slotId: string | null = null;
      if (plan.type === PlanType.DAY_PASS) {
        if (!dto.slotId)
          this.fail(
            ApiErrorCode.SLOT_NOT_FOUND,
            'A slot is required for a day pass',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        const slot = await tx.slotInstance.findUnique({ where: { id: dto.slotId } });
        if (!slot || slot.branchId !== dto.branchId)
          this.fail(ApiErrorCode.SLOT_NOT_FOUND, 'Slot not found', HttpStatus.NOT_FOUND);
        if (slot.status !== SlotStatus.AVAILABLE)
          this.fail(ApiErrorCode.SLOT_UNAVAILABLE, 'Slot is unavailable', HttpStatus.CONFLICT);
        const now = new Date();
        const minimum = new Date(
          now.getTime() + (branch.slotConfig?.minimumAdvanceMinutes ?? 0) * 60_000,
        );
        const maximum = new Date(
          now.getTime() + (branch.slotConfig?.bookingWindowDays ?? 30) * 86_400_000,
        );
        if (slot.startAt <= minimum || slot.startAt > maximum)
          this.fail(
            ApiErrorCode.BOOKING_WINDOW_CLOSED,
            'Slot is outside the booking window',
            HttpStatus.CONFLICT,
          );
        const duplicate = await tx.booking.count({
          where: {
            userId,
            slotId: slot.id,
            OR: [
              { status: { in: consumingStatuses } },
              { status: BookingStatus.PAYMENT_PENDING, reservationExpiresAt: { gt: now } },
            ],
          },
        });
        if (duplicate)
          this.fail(
            ApiErrorCode.BOOKING_ALREADY_EXISTS,
            'An active booking already exists for this slot',
            HttpStatus.CONFLICT,
          );
        const used = await tx.booking.count({
          where: {
            slotId: slot.id,
            OR: [
              { status: { in: consumingStatuses } },
              { status: BookingStatus.PAYMENT_PENDING, reservationExpiresAt: { gt: now } },
            ],
          },
        });
        if (used >= slot.capacity) {
          this.logger.warn({ slotId: slot.id }, 'Slot capacity rejected');
          this.fail(ApiErrorCode.SLOT_FULL, 'Slot is full', HttpStatus.CONFLICT);
        }
        slotId = slot.id;
      } else if (dto.slotId)
        this.fail(
          ApiErrorCode.SLOT_UNAVAILABLE,
          'Membership purchases do not require a slot in Phase 4',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
      return tx.booking.create({
        data: {
          userId,
          gymId: plan.gymId,
          branchId: dto.branchId,
          planId: plan.id,
          slotId,
          status: BookingStatus.PAYMENT_PENDING,
          planName: plan.name,
          planType: plan.type,
          priceMinor: plan.priceMinor,
          currency: plan.currency,
          idempotencyKey,
          requestFingerprint: fingerprint,
          reservationExpiresAt: expiresAt,
          events: {
            create: {
              type: BookingEventType.BOOKING_CREATED,
              fromStatus: BookingStatus.CREATED,
              toStatus: BookingStatus.PAYMENT_PENDING,
              actorUserId: userId,
            },
          },
        },
        select: bookingSelect,
      });
    });
  }

  async listMine(userId: string, query: BookingListDto): Promise<unknown> {
    await this.checkIns?.syncScope({ userId });
    return this.list({ userId, status: query.status }, query);
  }
  async getMine(userId: string, bookingId: string): Promise<unknown> {
    await this.checkIns?.syncBooking(bookingId);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      select: bookingSelect,
    });
    if (!booking) this.notFound();
    return booking;
  }
  async cancel(userId: string, bookingId: string): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id: bookingId, userId, status: BookingStatus.PAYMENT_PENDING },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      });
      if (!result.count)
        this.fail(
          ApiErrorCode.INVALID_BOOKING_TRANSITION,
          'Only payment-pending bookings can be cancelled in Phase 4',
          HttpStatus.CONFLICT,
        );
      await tx.bookingEvent.create({
        data: {
          bookingId,
          type: BookingEventType.BOOKING_CANCELLED,
          fromStatus: BookingStatus.PAYMENT_PENDING,
          toStatus: BookingStatus.CANCELLED,
          actorUserId: userId,
        },
      });
      this.logger.log({ bookingId }, 'Booking cancelled');
      return tx.booking.findUnique({ where: { id: bookingId }, select: bookingSelect });
    });
  }

  async listPartner(user: AuthUser, query: ManagedBookingListDto): Promise<unknown> {
    if (query.branchId) await this.access.assertBranchManagement(user, query.branchId);
    else if (query.gymId) await this.access.assertGymManagement(user, query.gymId);
    else if (!this.access.isAdmin(user))
      this.fail(
        ApiErrorCode.BOOKING_ACCESS_DENIED,
        'Select an authorized gym or branch',
        HttpStatus.FORBIDDEN,
      );
    const scope: Prisma.BookingWhereInput = this.access.isAdmin(user)
      ? {}
      : query.branchId
        ? { branchId: query.branchId }
        : { gymId: query.gymId };
    await this.checkIns?.syncScope(scope);
    let slotDate: Prisma.BookingWhereInput = {};
    if (query.date) {
      if (!query.branchId)
        this.fail(
          ApiErrorCode.VALIDATION_FAILED,
          'Select a branch when filtering by slot date',
          HttpStatus.BAD_REQUEST,
        );
      const branch = await this.prisma.gymBranch.findUnique({
        where: { id: query.branchId },
        select: { timezone: true },
      });
      if (!branch)
        this.fail(ApiErrorCode.BRANCH_NOT_FOUND, 'Branch not found', HttpStatus.NOT_FOUND);
      const local = DateTime.fromISO(query.date, { zone: branch.timezone });
      slotDate = {
        slot: {
          startAt: {
            gte: local.startOf('day').toUTC().toJSDate(),
            lt: local.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
          },
        },
      };
    }
    return this.list({ ...scope, ...this.filters(query), ...slotDate }, query);
  }
  async getPartner(user: AuthUser, bookingId: string): Promise<unknown> {
    await this.checkIns?.syncBooking(bookingId);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: bookingSelect,
    });
    if (!booking) this.notFound();
    await this.access.assertBranchManagement(user, booking.branchId);
    return booking;
  }
  listAdmin(query: ManagedBookingListDto): Promise<unknown> {
    return this.listAdminSynced(query);
  }
  private async listAdminSynced(query: ManagedBookingListDto): Promise<unknown> {
    await this.checkIns?.syncScope(this.filters(query));
    return this.list(this.filters(query), query);
  }
  async getAdmin(bookingId: string): Promise<unknown> {
    await this.checkIns?.syncBooking(bookingId);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: bookingSelect,
    });
    if (!booking) this.notFound();
    return booking;
  }

  private async list(where: Prisma.BookingWhereInput, query: BookingListDto): Promise<unknown> {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        select: bookingSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { data, meta: pageMeta(query.page, query.limit, total) };
  }
  private filters(query: ManagedBookingListDto): Prisma.BookingWhereInput {
    return {
      status: query.status,
      gymId: query.gymId,
      branchId: query.branchId,
      userId: query.userId,
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from && { gte: new Date(query.from) }),
              ...(query.to && { lte: new Date(query.to) }),
            },
          }
        : {}),
    };
  }
  private async resolvePrior(
    booking: { id: string; requestFingerprint: string },
    fingerprint: string,
  ): Promise<BookingView> {
    if (booking.requestFingerprint !== fingerprint)
      this.fail(
        ApiErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'Idempotency key was already used for a different request',
        HttpStatus.CONFLICT,
      );
    return this.prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: bookingSelect,
    });
  }
  private notFound(): never {
    return this.fail(ApiErrorCode.BOOKING_NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
  }
  private fail(code: ApiErrorCode, message: string, status: HttpStatus): never {
    throw new DomainException(code, message, status);
  }
}
