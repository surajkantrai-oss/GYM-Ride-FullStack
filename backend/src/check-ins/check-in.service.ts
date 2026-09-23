import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  BookingEventType,
  BookingStatus,
  CheckInMethod,
  CheckInStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { PrismaService } from '../database/prisma.service';
import { CheckInPolicy, CheckInWindow } from './check-in.policy';
import { createNotificationIntent } from '../notifications/notification-intent';

export const checkInBookingInclude = {
  slot: true,
  payment: true,
  flexUsage: true,
  checkIn: true,
  gym: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, city: true, timezone: true } },
} satisfies Prisma.BookingInclude;

export type CheckInBooking = Prisma.BookingGetPayload<{
  include: typeof checkInBookingInclude;
}>;

@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CheckInPolicy,
  ) {}

  async getCustomer(userId: string, bookingId: string): Promise<unknown> {
    await this.syncBooking(bookingId);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: checkInBookingInclude,
    });
    if (!booking) this.fail(ApiErrorCode.BOOKING_NOT_FOUND, 'Booking not found', 404);
    return this.customerView(booking);
  }

  async ensureOwnedEligibility(userId: string, bookingId: string): Promise<CheckInBooking> {
    await this.syncBooking(bookingId);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: checkInBookingInclude,
    });
    if (!booking) this.fail(ApiErrorCode.BOOKING_NOT_FOUND, 'Booking not found', 404);
    this.assertCredentialEligibility(booking, userId, new Date());
    return booking;
  }

  assertCredentialEligibility(booking: CheckInBooking, userId: string, now: Date): CheckInWindow {
    if (booking.userId !== userId)
      this.fail(ApiErrorCode.BOOKING_NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
    if (!booking.slot)
      this.fail(
        ApiErrorCode.BOOKING_NOT_ELIGIBLE_FOR_CHECK_IN,
        'A timed booking is required for check-in',
        HttpStatus.CONFLICT,
      );
    const window = this.policy.window(booking.slot);
    if (booking.status === BookingStatus.CHECKED_IN || booking.status === BookingStatus.COMPLETED)
      this.fail(
        ApiErrorCode.CHECK_IN_ALREADY_COMPLETED,
        'Booking has already been checked in',
        HttpStatus.CONFLICT,
      );
    if (booking.status === BookingStatus.CONFIRMED && now < window.opensAt)
      this.policy.assertOpen(window, now);
    if (booking.status !== BookingStatus.CHECK_IN_AVAILABLE)
      this.fail(
        ApiErrorCode.BOOKING_NOT_ELIGIBLE_FOR_CHECK_IN,
        'Booking is not eligible for check-in',
        HttpStatus.CONFLICT,
      );
    this.policy.assertOpen(window, now);
    this.assertFinancialIntegrity(booking);
    if (!booking.checkIn)
      this.fail(
        ApiErrorCode.BOOKING_NOT_ELIGIBLE_FOR_CHECK_IN,
        'Check-in record is unavailable',
        HttpStatus.CONFLICT,
      );
    return window;
  }

  async verifyInTransaction(
    tx: Prisma.TransactionClient,
    bookingId: string,
    checkInId: string,
    verifiedByUserId: string,
    method: CheckInMethod,
    now: Date,
  ): Promise<void> {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: checkInBookingInclude,
    });
    if (!booking || booking.checkIn?.id !== checkInId)
      this.fail(ApiErrorCode.INVALID_CHECK_IN_TOKEN, 'Invalid check-in credential', 400);
    if (booking.status === BookingStatus.CHECKED_IN || booking.status === BookingStatus.COMPLETED)
      this.fail(
        ApiErrorCode.CHECK_IN_ALREADY_COMPLETED,
        'Booking has already been checked in',
        HttpStatus.CONFLICT,
      );
    if (!booking.slot || booking.status !== BookingStatus.CHECK_IN_AVAILABLE)
      this.fail(
        ApiErrorCode.BOOKING_NOT_ELIGIBLE_FOR_CHECK_IN,
        'Booking is not eligible for check-in',
        HttpStatus.CONFLICT,
      );
    this.policy.assertOpen(this.policy.window(booking.slot), now);
    this.assertFinancialIntegrity(booking);

    const changed = await tx.booking.updateMany({
      where: { id: booking.id, status: BookingStatus.CHECK_IN_AVAILABLE },
      data: { status: BookingStatus.CHECKED_IN },
    });
    if (changed.count !== 1)
      this.fail(
        ApiErrorCode.CHECK_IN_ALREADY_COMPLETED,
        'Booking has already been checked in',
        HttpStatus.CONFLICT,
      );
    await tx.checkIn.update({
      where: { id: checkInId },
      data: {
        status: CheckInStatus.VERIFIED,
        method,
        verifiedByUserId,
        verifiedAt: now,
      },
    });
    await Promise.all([
      tx.checkInToken.updateMany({
        where: { checkInId, consumedAt: null },
        data: { consumedAt: now },
      }),
      tx.checkInOtpChallenge.updateMany({
        where: { checkInId, consumedAt: null },
        data: { consumedAt: now },
      }),
    ]);
    await tx.bookingEvent.create({
      data: {
        bookingId: booking.id,
        type:
          method === CheckInMethod.QR
            ? BookingEventType.QR_CHECK_IN_VERIFIED
            : BookingEventType.OTP_CHECK_IN_VERIFIED,
        fromStatus: BookingStatus.CHECK_IN_AVAILABLE,
        toStatus: BookingStatus.CHECKED_IN,
        actorUserId: verifiedByUserId,
        metadata: { method, checkInId },
      },
    });
    if (booking.source === 'FLEX') {
      const usage = await tx.flexUsage.findUnique({ where: { bookingId: booking.id } });
      if (!usage || usage.status !== 'RESERVED')
        this.fail(ApiErrorCode.FLEX_USAGE_ALREADY_CONSUMED, 'Flex usage is not reserved', HttpStatus.CONFLICT);
      await tx.flexUsage.update({ where: { id: usage.id }, data: { status: 'CONSUMED', consumedAt: now } });
      await tx.gymEarning.create({ data: {
        flexUsageId: usage.id, source: 'FLEX_USAGE', gymId: usage.gymId, branchId: usage.branchId,
        grossAmount: usage.reimbursementMinor, commissionAmount: 0, commissionBps: 0,
        commissionVersion: usage.reimbursementVersion, netAmount: usage.reimbursementMinor,
        currency: usage.reimbursementCurrency,
      } });
      await tx.financialLedgerEntry.create({ data: {
        sourceId: usage.id, sourceType: 'FLEX_USAGE', gymId: usage.gymId, branchId: usage.branchId,
        category: 'FLEX_REIMBURSEMENT', account: 'gym_payable', amount: usage.reimbursementMinor,
        currency: usage.reimbursementCurrency,
      } });
      await createNotificationIntent(tx, {
        userId: booking.userId, type: 'FLEX_USAGE_RECORDED', category: 'FLEX',
        title: 'Flex visit recorded', body: `Your visit to ${booking.gym.name} used one Flex credit.`,
        route: { screen: 'Booking', bookingId: booking.id }, dedupeKey: `flex-usage:${usage.id}:consumed`,
      });
    }
  }

  async verificationView(bookingId: string): Promise<unknown> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        planName: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        gym: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, city: true, timezone: true } },
        slot: { select: { startAt: true, endAt: true } },
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
      },
    });
    return booking;
  }

  async syncBooking(bookingId: string, now = new Date()): Promise<boolean> {
    const changed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: checkInBookingInclude,
      });
      if (!booking?.slot) return false;
      const window = this.policy.window(booking.slot);
      let status = booking.status;
      let didChange = false;

      if (status === BookingStatus.CONFIRMED && now >= window.opensAt) {
        if (!this.hasFinancialIntegrity(booking)) return false;
        await tx.checkIn.upsert({
          where: { bookingId },
          create: {
            bookingId,
            customerId: booking.userId,
            gymId: booking.gymId,
            branchId: booking.branchId,
          },
          update: {},
        });
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.CHECK_IN_AVAILABLE },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId,
            type: BookingEventType.CHECK_IN_AVAILABLE,
            fromStatus: BookingStatus.CONFIRMED,
            toStatus: BookingStatus.CHECK_IN_AVAILABLE,
            metadata: {
              opensAt: window.opensAt.toISOString(),
              closesAt: window.closesAt.toISOString(),
            },
          },
        });
        status = BookingStatus.CHECK_IN_AVAILABLE;
        didChange = true;
      }

      if (status === BookingStatus.CHECK_IN_AVAILABLE && now >= window.noShowAt) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.NO_SHOW, completedAt: now },
        });
        await tx.checkIn.updateMany({
          where: { bookingId },
          data: { status: CheckInStatus.EXPIRED, completedAt: now },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId,
            type: BookingEventType.BOOKING_NO_SHOW,
            fromStatus: BookingStatus.CHECK_IN_AVAILABLE,
            toStatus: BookingStatus.NO_SHOW,
            metadata: { noShowAt: window.noShowAt.toISOString() },
          },
        });
        if (booking.source === 'FLEX')
          await tx.flexUsage.updateMany({ where: { bookingId, status: 'RESERVED' }, data: { status: 'FORFEITED', consumedAt: now } });
        didChange = true;
      } else if (status === BookingStatus.CHECKED_IN && now >= window.completesAt) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.COMPLETED, completedAt: now },
        });
        await tx.checkIn.updateMany({
          where: { bookingId },
          data: { status: CheckInStatus.COMPLETED, completedAt: now },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId,
            type: BookingEventType.BOOKING_COMPLETED,
            fromStatus: BookingStatus.CHECKED_IN,
            toStatus: BookingStatus.COMPLETED,
            metadata: { completesAt: window.completesAt.toISOString() },
          },
        });
        didChange = true;
      }
      return didChange;
    });
    if (changed) this.logger.log({ bookingId }, 'Booking check-in lifecycle advanced');
    return changed;
  }

  async syncScope(where: Prisma.BookingWhereInput, limit = 200): Promise<number> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        ...where,
        slotId: { not: null },
        status: {
          in: [BookingStatus.CONFIRMED, BookingStatus.CHECK_IN_AVAILABLE, BookingStatus.CHECKED_IN],
        },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    const results = await Promise.all(bookings.map((booking) => this.syncBooking(booking.id)));
    return results.filter(Boolean).length;
  }

  private customerView(booking: CheckInBooking): unknown {
    const window = booking.slot ? this.policy.window(booking.slot) : null;
    const now = new Date();
    const eligible =
      booking.status === BookingStatus.CHECK_IN_AVAILABLE &&
      !!window &&
      now >= window.opensAt &&
      now <= window.closesAt;
    return {
      bookingId: booking.id,
      bookingStatus: booking.status,
      planName: booking.planName,
      gym: booking.gym,
      branch: booking.branch,
      slot: booking.slot
        ? { id: booking.slot.id, startAt: booking.slot.startAt, endAt: booking.slot.endAt }
        : null,
      eligible,
      window: window
        ? {
            opensAt: window.opensAt,
            closesAt: window.closesAt,
            completesAt: window.completesAt,
            noShowAt: window.noShowAt,
          }
        : null,
      checkIn: booking.checkIn
        ? {
            id: booking.checkIn.id,
            status: booking.checkIn.status,
            method: booking.checkIn.method,
            verifiedAt: booking.checkIn.verifiedAt,
            completedAt: booking.checkIn.completedAt,
          }
        : null,
    };
  }

  private assertFinancialIntegrity(booking: CheckInBooking): void {
    if (!this.hasFinancialIntegrity(booking))
      this.fail(
        ApiErrorCode.BOOKING_NOT_ELIGIBLE_FOR_CHECK_IN,
        'Booking does not have a valid captured payment',
        HttpStatus.CONFLICT,
      );
  }

  private hasFinancialIntegrity(booking: CheckInBooking): boolean {
    if (booking.source === 'FLEX')
      return !!(
        booking.flexSubscriptionId &&
        booking.flexUsage?.status === 'RESERVED' &&
        booking.customerChargeMinor === 0 &&
        booking.reimbursementMinor === booking.flexUsage.reimbursementMinor &&
        booking.reimbursementCurrency === booking.flexUsage.reimbursementCurrency
      );
    const payment = booking.payment;
    return !!(
      payment?.capturedAt &&
      payment.amount === booking.priceMinor &&
      payment.currency === booking.currency &&
      payment.refundedAmount < payment.amount &&
      payment.status !== PaymentStatus.REFUNDED
    );
  }

  private fail(code: ApiErrorCode, message: string, status: number): never {
    throw new DomainException(code, message, status);
  }
}
