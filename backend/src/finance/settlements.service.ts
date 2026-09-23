import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ApiErrorCode as E } from '../common/errors/api-error-code';
import { financeError } from './finance-policy';
import { lockFinance } from './finance-lock';
import { PayoutProvider } from './providers/payout-provider';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutProvider,
  ) {}

  async reverse(actorId: string, id: string, reason: string, key: string): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      await lockFinance(tx);
      const prior = await tx.settlementReversal.findUnique({ where: { idempotencyKey: key } });
      if (prior) {
        if (prior.settlementId !== id || prior.reason !== reason || prior.actorId !== actorId)
          financeError(E.IDEMPOTENCY_KEY_CONFLICT, 'Reversal key has different inputs');
        return prior;
      }
      const settlement = await tx.settlement.findUnique({
        where: { id },
        include: { items: true, reversal: true },
      });
      if (!settlement) financeError(E.SETTLEMENT_NOT_FOUND, 'Settlement not found', 404);
      if (settlement.status !== 'PAID' || settlement.reversal)
        financeError(
          E.INVALID_SETTLEMENT_STATE,
          'Only a paid, unreversed settlement may be reversed',
        );
      const original = await tx.financialLedgerEntry.findUnique({
        where: {
          sourceId_category_account: {
            sourceId: id,
            category: 'SETTLEMENT',
            account: 'gym_payable',
          },
        },
      });
      if (
        !original ||
        original.amount !== -settlement.netAmount ||
        original.currency !== settlement.currency
      )
        financeError(E.FINANCIAL_INTEGRITY_ERROR, 'Original settlement ledger does not reconcile');
      const reversal = await tx.settlementReversal.create({
        data: {
          settlementId: id,
          originalLedgerId: original.id,
          idempotencyKey: key,
          reason,
          actorId,
        },
      });
      await tx.financialLedgerEntry.create({
        data: {
          sourceId: id,
          sourceType: 'SETTLEMENT',
          gymId: settlement.gymId,
          category: 'SETTLEMENT_REVERSAL',
          account: 'gym_payable',
          amount: settlement.netAmount,
          currency: settlement.currency,
        },
      });
      await tx.gymEarning.updateMany({
        where: { id: { in: settlement.items.map((item) => item.earningId) } },
        data: { settled: false },
      });
      // Preserve immutable allocations as a payout hold. Reversal restores liability, not automatic re-dispatch authority.
      await tx.settlement.update({ where: { id }, data: { status: 'REVERSED' } });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: 'RECONCILIATION_RUN',
          entityType: 'SettlementReversal',
          entityId: reversal.id,
          metadata: {
            operation: 'SETTLEMENT_REVERSED',
            settlementId: id,
            originalLedgerId: original.id,
            reason,
          },
        },
      });
      return reversal;
    });
  }
  async generate(
    actorId: string,
    gymId: string,
    start: Date,
    end: Date,
    key: string,
  ): Promise<unknown> {
    if (start >= end || end > new Date())
      financeError(E.VALIDATION_FAILED, 'Settlement period must be closed and ordered', 400);
    return this.prisma.$transaction(async (tx) => {
      await lockFinance(tx);
      const previous = await tx.settlement.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (
          previous.gymId !== gymId ||
          +previous.periodStart !== +start ||
          +previous.periodEnd !== +end
        )
          financeError(E.IDEMPOTENCY_KEY_CONFLICT, 'Settlement key has different inputs');
        return previous;
      }
      const earnings = await tx.gymEarning.findMany({
        where: {
          settled: false,
          settlementItem: null,
          netAmount: { gt: 0 },
          gymId,
          createdAt: { gte: start, lt: end },
          OR: [
            {
              source: 'STANDARD_PAYMENT',
              payment: {
                requiresReview: false,
                status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] },
                refunds: { none: { status: { in: ['CREATED', 'PENDING', 'PROCESSING'] } } },
              },
            },
            { source: 'FLEX_USAGE', flexUsage: { status: 'CONSUMED' } },
          ],
        },
        orderBy: { id: 'asc' },
        take: 1000,
      });
      if (!earnings.length)
        financeError(E.INVALID_SETTLEMENT_STATE, 'No eligible earnings in the selected period');
      const sum = (
        field: 'grossAmount' | 'commissionAmount' | 'refundAmount' | 'netAmount',
      ): number => earnings.reduce((total, e) => total + e[field], 0);
      if (!Number.isSafeInteger(sum('netAmount')) || sum('grossAmount') > 2147483647)
        financeError(
          E.FINANCIAL_INTEGRITY_ERROR,
          'Settlement batch exceeds supported amount; use a smaller period',
        );
      const settlement = await tx.settlement.create({
        data: {
          gymId,
          idempotencyKey: key,
          periodStart: start,
          periodEnd: end,
          currency: 'INR',
          status: 'READY',
          grossAmount: sum('grossAmount'),
          commissionAmount: earnings.reduce(
            (n, e) => n + e.commissionAmount - e.commissionReversed,
            0,
          ),
          refundAmount: sum('refundAmount'),
          netAmount: sum('netAmount'),
          items: { create: earnings.map((e) => ({ earningId: e.id, amount: e.netAmount })) },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: 'SETTLEMENT_GENERATED',
          entityType: 'Settlement',
          entityId: settlement.id,
        },
      });
      return settlement;
    });
  }

  async process(actorId: string, id: string): Promise<unknown> {
    const intent = await this.prisma.$transaction(async (tx) => {
      await lockFinance(tx);
      const settlement = await tx.settlement.findUnique({ where: { id } });
      if (!settlement) financeError(E.SETTLEMENT_NOT_FOUND, 'Settlement not found', 404);
      if (settlement.status === 'PAID') return { settlement, dispatch: false };
      if (settlement.status !== 'READY' && settlement.status !== 'PROCESSING')
        financeError(E.INVALID_SETTLEMENT_STATE, 'Settlement cannot be processed');
      await tx.settlement.update({
        where: { id },
        data: { status: 'PROCESSING', processedAt: new Date() },
      });
      if (settlement.status === 'READY')
        await tx.auditLog.create({
          data: {
            actorUserId: actorId,
            action: 'SETTLEMENT_PROCESSING',
            entityType: 'Settlement',
            entityId: id,
          },
        });
      return { settlement, dispatch: true };
    });
    if (!intent.dispatch) return intent.settlement;
    // Development payouts are deterministic and retry-safe. Real payouts require a durable provider idempotency contract.
    const payout = await this.payouts.process(
      id,
      intent.settlement.netAmount,
      intent.settlement.currency,
    );
    return this.prisma.$transaction(async (tx) => {
      await lockFinance(tx);
      const settlement = await tx.settlement.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      if (settlement.status === 'PAID') return settlement;
      if (settlement.status !== 'PROCESSING')
        financeError(E.INVALID_SETTLEMENT_STATE, 'Settlement changed during payout');
      await tx.gymEarning.updateMany({
        where: { id: { in: settlement.items.map((item) => item.earningId) } },
        data: { settled: true },
      });
      await tx.financialLedgerEntry.create({
        data: {
          sourceId: id,
          sourceType: 'SETTLEMENT',
          gymId: settlement.gymId,
          category: 'SETTLEMENT',
          account: 'gym_payable',
          amount: -settlement.netAmount,
          currency: settlement.currency,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: 'SETTLEMENT_PAID',
          entityType: 'Settlement',
          entityId: id,
          metadata: { simulated: payout.simulated },
        },
      });
      return tx.settlement.update({
        where: { id },
        data: { status: 'PAID', providerReference: payout.reference, paidAt: new Date() },
      });
    });
  }
}
