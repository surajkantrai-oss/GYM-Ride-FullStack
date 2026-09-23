import { Injectable, Logger, Optional } from '@nestjs/common';
import { BookingStatus, LedgerCategory, Payment, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { ApiErrorCode as E } from '../common/errors/api-error-code';
import { CommissionService, assertPaymentTransition, financeError } from './finance-policy';
import { PaymentProvider, VerifiedPayment } from './providers/payment-provider';
import { DevelopmentPaymentProvider } from './providers/development-payment.provider';
import { lockFinance } from './finance-lock';
import { RefundsService } from './refunds.service';
import { ProviderEvent } from './providers/payment-provider';
import { CheckInLifecycleService } from '../check-ins/check-in-lifecycle.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly commission: CommissionService,
    @Optional() private readonly refunds?: RefundsService,
    @Optional() private readonly checkInLifecycle?: CheckInLifecycleService,
  ) {}

  async createOrder(userId: string, bookingId: string): Promise<unknown> {
    const intent = await this.prisma.$transaction(async (tx) => {
      await lockFinance(tx);
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, userId },
        include: { payment: true },
      });
      if (!booking) financeError(E.BOOKING_NOT_FOUND, 'Booking not found', 404);
      if (booking.status !== 'PAYMENT_PENDING')
        financeError(E.INVALID_PAYMENT_STATE, 'Booking is not awaiting payment');
      if (!booking.reservationExpiresAt || booking.reservationExpiresAt <= new Date())
        financeError(E.RESERVATION_EXPIRED, 'Reservation expired');
      if (booking.payment) return { payment: booking.payment, dispatch: false };
      const payment = await tx.payment.create({
        data: {
          bookingId,
          provider: this.provider.name,
          amount: booking.priceMinor,
          currency: booking.currency,
        },
      });
      await tx.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          operationKey: `order:${payment.id}`,
          operation: 'CREATE_ORDER',
          status: 'DISPATCHING',
        },
      });
      return { payment, dispatch: true };
    });
    if (!intent.dispatch) {
      if (!intent.payment.providerOrderId)
        financeError(
          E.PAYMENT_ORDER_CREATION_FAILED,
          'Order creation is in progress or needs provider reconciliation',
        );
      return this.checkout(intent.payment);
    }
    try {
      const order = await this.provider.createPaymentOrder(
        intent.payment.id,
        intent.payment.amount,
        intent.payment.currency,
      );
      if (order.amount !== intent.payment.amount || order.currency !== intent.payment.currency)
        financeError(E.PAYMENT_AMOUNT_MISMATCH, 'Provider order differs from booking');
      const payment = await this.prisma.$transaction(async (tx) => {
        const result = await tx.payment.update({
          where: { id: intent.payment.id },
          data: { providerOrderId: order.id, status: 'PENDING' },
        });
        await tx.paymentAttempt.update({
          where: { operationKey: `order:${result.id}` },
          data: { status: 'COMPLETED', providerReference: order.id },
        });
        return result;
      });
      return this.checkout(payment);
    } catch {
      await this.prisma.paymentAttempt.update({
        where: { operationKey: `order:${intent.payment.id}` },
        data: { status: 'UNKNOWN' },
      });
      financeError(
        E.PAYMENT_ORDER_CREATION_FAILED,
        'Provider outcome is uncertain; reconciliation required',
      );
    }
  }

  private checkout(payment: Payment): unknown {
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      provider: payment.provider,
      orderId: payment.providerOrderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      ...this.provider.checkoutConfiguration(),
      simulated: payment.provider === 'development',
    };
  }

  async verify(
    userId: string,
    paymentId: string,
    orderId: string,
    providerPaymentId: string,
    signature: string,
  ): Promise<unknown> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, booking: { userId } },
    });
    if (!payment) financeError(E.PAYMENT_NOT_FOUND, 'Payment not found', 404);
    if (payment.provider !== this.provider.name || payment.providerOrderId !== orderId)
      financeError(E.PAYMENT_VERIFICATION_FAILED, 'Order does not match payment');
    let verified: VerifiedPayment;
    try {
      verified = await this.provider.verifyPayment(orderId, providerPaymentId, signature);
    } catch {
      financeError(E.INVALID_PAYMENT_SIGNATURE, 'Payment proof could not be verified', 400);
    }
    return this.finalize(payment.id, verified);
  }

  async simulate(paymentId: string): Promise<unknown> {
    if (!(this.provider instanceof DevelopmentPaymentProvider))
      financeError(E.FORBIDDEN, 'Simulation is disabled', 403);
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });
    if (!payment?.providerOrderId) financeError(E.PAYMENT_NOT_FOUND, 'Order not found', 404);
    const receipt = this.provider.simulate(
      payment.providerOrderId,
      payment.amount,
      payment.currency,
    );
    return this.verify(
      payment.booking.userId,
      payment.id,
      payment.providerOrderId,
      receipt.paymentId,
      receipt.signature,
    );
  }

  async finalize(paymentId: string, verified: VerifiedPayment): Promise<unknown> {
    const finalized: unknown = await this.prisma.$transaction(async (tx) => {
      await lockFinance(tx);
      const initial = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${initial.bookingId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { booking: true },
      });
      if (
        verified.orderId !== payment.providerOrderId ||
        (payment.providerPaymentId && verified.id !== payment.providerPaymentId)
      )
        financeError(E.PAYMENT_VERIFICATION_FAILED, 'Provider relationship mismatch');
      if (
        verified.amount !== payment.amount ||
        verified.currency !== payment.currency ||
        payment.amount !== payment.booking.priceMinor ||
        payment.currency !== payment.booking.currency
      )
        financeError(E.PAYMENT_AMOUNT_MISMATCH, 'Payment differs from immutable booking snapshot');
      if (payment.capturedAt) return this.checkout(payment);
      const next =
        verified.status === 'captured'
          ? 'SUCCESS'
          : verified.status === 'authorized'
            ? 'AUTHORIZED'
            : 'FAILED';
      // Ignore stale failure/authorization after a later provider state.
      if (payment.status === 'AUTHORIZED' && next === 'FAILED') return this.checkout(payment);
      assertPaymentTransition(payment.status, next);
      if (next !== 'SUCCESS')
        return this.checkout(
          await tx.payment.update({ where: { id: payment.id }, data: { status: next } }),
        );
      const booking = payment.booking;
      const confirm =
        booking.status === 'PAYMENT_PENDING' &&
        !!booking.reservationExpiresAt &&
        booking.reservationExpiresAt > new Date();
      const result = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          providerPaymentId: verified.id,
          capturedAt: new Date(),
          requiresReview: !confirm,
        },
      });
      const snapshot = this.commission.calculate(payment.amount);
      await tx.gymEarning.create({
        data: {
          paymentId,
          gymId: booking.gymId,
          branchId: booking.branchId,
          source: 'STANDARD_PAYMENT',
          grossAmount: payment.amount,
          currency: payment.currency,
          ...snapshot,
        },
      });
      await tx.financialLedgerEntry.createMany({
        data: [
          {
            category: LedgerCategory.CUSTOMER_PAYMENT,
            account: 'provider_clearing',
            amount: payment.amount,
          },
          {
            category: LedgerCategory.PLATFORM_COMMISSION,
            account: 'platform_revenue',
            amount: snapshot.commissionAmount,
          },
          {
            category: LedgerCategory.GYM_EARNING,
            account: 'gym_payable',
            amount: snapshot.netAmount,
          },
        ].map((entry) => ({
          ...entry,
          sourceId: payment.id,
          sourceType: 'PAYMENT',
          gymId: booking.gymId,
          branchId: booking.branchId,
          currency: payment.currency,
        })),
      });
      if (confirm) {
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            type: 'STATUS_CHANGED',
            fromStatus: BookingStatus.PAYMENT_PENDING,
            toStatus: BookingStatus.CONFIRMED,
          },
        });
      }
      return { response: this.checkout(result), confirmedBookingId: confirm ? booking.id : null };
    });
    if (
      typeof finalized === 'object' &&
      finalized !== null &&
      'confirmedBookingId' in finalized &&
      'response' in finalized
    ) {
      if (typeof finalized.confirmedBookingId === 'string') {
        try {
          await this.checkInLifecycle?.scheduleBooking(finalized.confirmedBookingId);
        } catch (error) {
          this.logger.warn(
            {
              bookingId: finalized.confirmedBookingId,
              error: error instanceof Error ? error.message : 'unknown',
            },
            'Check-in scheduling failed; periodic reconciliation remains available',
          );
        }
      }
      return finalized.response;
    }
    return finalized;
  }

  async webhook(
    provider: string,
    eventId: string,
    raw: Buffer,
    signature: string,
  ): Promise<unknown> {
    if (provider !== this.provider.name || !this.provider.verifyWebhook(raw, signature))
      financeError(E.INVALID_PAYMENT_SIGNATURE, 'Invalid webhook signature', 400);
    if (!eventId || eventId.length > 160)
      financeError(E.VALIDATION_FAILED, 'Provider event ID required', 400);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      financeError(E.VALIDATION_FAILED, 'Invalid webhook JSON', 400);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      financeError(E.VALIDATION_FAILED, 'Invalid webhook payload', 400);
    let decoded: ProviderEvent;
    try {
      decoded = this.provider.decodeWebhook(parsed);
    } catch {
      financeError(E.VALIDATION_FAILED, 'Malformed provider event', 400);
    }
    const hash = createHash('sha256').update(raw).digest('hex');
    const event = await this.prisma.paymentWebhookEvent
      .upsert({
        where: { provider_providerEventId: { provider, providerEventId: eventId } },
        create: {
          provider,
          providerEventId: eventId,
          payloadHash: hash,
          eventType: decoded.type,
          reference: decoded.kind === 'ignored' ? undefined : decoded.id,
        },
        update: {},
      })
      .catch(async (error: unknown) => {
        // Prisma can implement an empty-update upsert as read/create. A concurrent insert wins safely.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
          throw error;
        return this.prisma.paymentWebhookEvent.findUniqueOrThrow({
          where: { provider_providerEventId: { provider, providerEventId: eventId } },
        });
      });
    if (event.payloadHash !== hash)
      financeError(E.FINANCIAL_INTEGRITY_ERROR, 'Event ID reused with changed payload');
    if (event.processedAt) return { accepted: true, duplicate: true };
    if (decoded.kind === 'ignored') {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: 'IGNORED', processedAt: new Date() },
      });
      return { accepted: true };
    }
    if (decoded.kind === 'refund') {
      if (!this.refunds) financeError(E.FINANCIAL_INTEGRITY_ERROR, 'Refund processor unavailable');
      const matched = await this.refunds.providerEvent(provider, decoded.id);
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: matched
          ? { processingStatus: 'PROCESSED', processedAt: new Date() }
          : { processingStatus: 'UNMATCHED' },
      });
      return { accepted: true, ...(!matched ? { reconciliationRequired: true } : {}) };
    }
    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId: decoded.orderId },
    });
    if (!payment || payment.provider !== provider) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: 'UNMATCHED' },
      });
      return { accepted: true, reconciliationRequired: true };
    }
    await this.finalize(payment.id, await this.provider.getPaymentStatus(decoded.id));
    await this.prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processingStatus: 'PROCESSED', processedAt: new Date() },
    });
    return { accepted: true };
  }
}
