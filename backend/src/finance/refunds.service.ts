import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ApiErrorCode as E } from '../common/errors/api-error-code';
import { RefundPolicy, financeError, proportional } from './finance-policy';
import { lockFinance } from './finance-lock';
import { PaymentProvider, ProviderRefund } from './providers/payment-provider';
import { canTransitionBooking } from '../bookings/booking-state';

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly policy: RefundPolicy,
  ) {}

  async request(
    actorId: string,
    paymentId: string,
    amount: number,
    reason: string,
    key: string,
    override = false,
  ): Promise<unknown> {
    const intent = await this.prisma.$transaction(async (tx) => {
      await lockFinance(tx);
      const previous = await tx.refund.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (
          previous.paymentId !== paymentId ||
          previous.amount !== amount ||
          previous.reason !== reason ||
          previous.policyOverride !== override ||
          previous.requestedBy !== actorId
        )
          financeError(E.IDEMPOTENCY_KEY_CONFLICT, 'Refund key has different inputs');
        return { refund: previous, dispatch: false, providerPaymentId: '' };
      }
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          booking: { include: { slot: true } },
          earning: { include: { settlementItem: true } },
        },
      });
      if (
        !payment?.capturedAt ||
        !payment.providerPaymentId ||
        payment.provider !== this.provider.name
      )
        financeError(E.REFUND_NOT_ALLOWED, 'No refundable captured payment');
      if (payment.earning?.settlementItem)
        financeError(
          E.REFUND_NOT_ALLOWED,
          'Earning is allocated to a settlement; controlled settlement reversal is required first',
        );
      this.policy.assertAllowed(
        payment.booking.status,
        payment.booking.slot?.startAt ?? null,
        override,
      );
      const reserved = await tx.refund.aggregate({
        where: { paymentId, status: { in: ['CREATED', 'PENDING', 'PROCESSING', 'SUCCESS'] } },
        _sum: { amount: true },
      });
      if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        (reserved._sum.amount ?? 0) + amount > payment.amount
      )
        financeError(E.REFUND_AMOUNT_EXCEEDED, 'Refund exceeds available captured amount');
      const refund = await tx.refund.create({
        data: {
          paymentId,
          amount,
          reason,
          policyOverride: override,
          idempotencyKey: key,
          requestedBy: actorId,
          status: 'PROCESSING',
        },
      });
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUND_PENDING' } });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: 'REFUND_REQUESTED',
          entityType: 'Refund',
          entityId: refund.id,
          metadata: { amount, reason, override },
        },
      });
      return { refund, dispatch: true, providerPaymentId: payment.providerPaymentId };
    });
    if (!intent.dispatch) return intent.refund;
    try {
      const result = await this.provider.refundPayment(
        intent.providerPaymentId,
        amount,
        intent.refund.id,
      );
      return await this.applyResult(intent.refund.id, result);
    } catch {
      // PROCESSING reserves the amount. Never replay an ambiguous money-moving request.
      return { ...intent.refund, reconciliationRequired: true };
    }
  }

  async reconcile(refundId: string): Promise<unknown> {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund?.providerRefundId)
      financeError(
        E.FINANCIAL_INTEGRITY_ERROR,
        'Provider refund reference is required for reconciliation',
      );
    return this.applyResult(refundId, await this.provider.getRefundStatus(refund.providerRefundId));
  }

  async providerEvent(provider: string, refundId: string): Promise<boolean> {
    if (provider !== this.provider.name)
      financeError(E.FINANCIAL_INTEGRITY_ERROR, 'Refund provider mismatch');
    const result = await this.provider.getRefundStatus(refundId);
    if (result.id !== refundId)
      financeError(E.FINANCIAL_INTEGRITY_ERROR, 'Refund reference mismatch');
    // A provider receipt recovers a persisted intent even if the webhook beats the HTTP response.
    const refund = await this.prisma.refund.findFirst({
      where: {
        OR: [
          { providerRefundId: refundId },
          ...(result.reference && /^[0-9a-f-]{36}$/i.test(result.reference)
            ? [{ id: result.reference }]
            : []),
        ],
      },
    });
    if (!refund) return false;
    await this.applyResult(refund.id, result);
    return true;
  }

  async applyResult(refundId: string, result: ProviderRefund): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      await lockFinance(tx);
      const reference = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        select: { payment: { select: { bookingId: true } } },
      });
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${reference.payment.bookingId}::uuid FOR UPDATE`;
      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        include: { payment: { include: { booking: true, earning: true } } },
      });
      const payment = refund.payment;
      if (
        payment.provider !== this.provider.name ||
        (result.currency !== undefined && result.currency !== payment.currency) ||
        (result.reference !== undefined && result.reference !== refund.id) ||
        result.paymentId !== payment.providerPaymentId ||
        result.amount !== refund.amount ||
        (refund.providerRefundId && refund.providerRefundId !== result.id)
      )
        financeError(E.FINANCIAL_INTEGRITY_ERROR, 'Refund provider details do not match');
      if (refund.status === 'FAILED' && result.status === 'processed')
        financeError(
          E.FINANCIAL_INTEGRITY_ERROR,
          'Provider contradicts terminal failed refund; controlled review required',
        );
      if (
        refund.status === 'SUCCESS' ||
        refund.status === 'FAILED' ||
        refund.status === 'CANCELLED'
      )
        return refund;
      const next =
        result.status === 'processed'
          ? 'SUCCESS'
          : result.status === 'failed'
            ? 'FAILED'
            : 'PENDING';
      const updated = await tx.refund.update({
        where: { id: refundId },
        data: { providerRefundId: result.id, status: next },
      });
      if (refund.status !== next)
        await tx.auditLog.create({
          data: {
            actorUserId: refund.requestedBy,
            action: 'RECONCILIATION_RUN',
            entityType: 'Refund',
            entityId: refund.id,
            metadata: { operation: 'VERIFIED_REFUND_STATUS', from: refund.status, to: next },
          },
        });
      let total = payment.refundedAmount;
      if (next === 'SUCCESS') {
        total += refund.amount;
        if (total > payment.amount || !payment.earning)
          financeError(E.FINANCIAL_INTEGRITY_ERROR, 'Refund accounting invariant failed');
        const earning = payment.earning;
        const reversalTotal = proportional(earning.commissionAmount, total, payment.amount);
        const commissionReversal = reversalTotal - earning.commissionReversed;
        await tx.gymEarning.update({
          where: { id: earning.id },
          data: {
            refundAmount: total,
            commissionReversed: reversalTotal,
            netAmount: earning.grossAmount - earning.commissionAmount - total + reversalTotal,
          },
        });
        await tx.financialLedgerEntry.createMany({
          data: [
            { account: 'provider_clearing', amount: -refund.amount },
            { account: 'platform_revenue', amount: -commissionReversal },
            { account: 'gym_payable', amount: -(refund.amount - commissionReversal) },
          ].map((entry) => ({
            ...entry,
            category: 'REFUND',
            sourceId: refund.id,
            sourceType: 'REFUND',
            gymId: payment.booking.gymId,
            branchId: payment.booking.branchId,
            currency: payment.currency,
          })),
        });
        if (total === payment.amount) {
          if (!canTransitionBooking(payment.booking.status, 'REFUNDED'))
            financeError(
              E.FINANCIAL_INTEGRITY_ERROR,
              'Booking changed during refund; controlled review required',
            );
          await tx.booking.update({
            where: { id: payment.bookingId },
            data: { status: 'REFUNDED' },
          });
          await tx.bookingEvent.create({
            data: {
              bookingId: payment.bookingId,
              type: 'STATUS_CHANGED',
              fromStatus: payment.booking.status,
              toStatus: 'REFUNDED',
            },
          });
        }
      }
      const pending = await tx.refund.count({
        where: { paymentId: payment.id, status: { in: ['CREATED', 'PENDING', 'PROCESSING'] } },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: total,
          status: pending
            ? 'REFUND_PENDING'
            : total === payment.amount
              ? 'REFUNDED'
              : total > 0
                ? 'PARTIALLY_REFUNDED'
                : 'SUCCESS',
          ...(total === payment.amount ? { requiresReview: false } : {}),
        },
      });
      return updated;
    });
  }
}
