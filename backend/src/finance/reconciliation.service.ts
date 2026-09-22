import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}
  async inspect(after?: string, afterSettlement?: string): Promise<unknown> {
    return this.prisma.$transaction((tx) => this.inspectSnapshot(tx, after, afterSettlement), {
      isolationLevel: 'RepeatableRead',
      timeout: 15000,
    });
  }
  private async inspectSnapshot(
    tx: Prisma.TransactionClient,
    after?: string,
    afterSettlement?: string,
  ): Promise<unknown> {
    const payments = await tx.payment.findMany({
      take: 500,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      include: {
        booking: true,
        earning: { include: { settlementItem: { include: { settlement: true } } } },
        refunds: true,
      },
    });
    const findings: { code: string; entityId: string }[] = [];
    const ids = payments.flatMap((p) => [
      p.id,
      ...p.refunds.map((r) => r.id),
      ...(p.earning?.settlementItem ? [p.earning.settlementItem.settlementId] : []),
    ]);
    const ledger = await tx.financialLedgerEntry.findMany({
      where: { sourceId: { in: ids } },
      select: { sourceId: true, category: true, account: true, amount: true, currency: true },
    });
    for (const p of payments) {
      const add = (code: string): void => {
        findings.push({ code, entityId: p.id });
      };
      if (p.amount !== p.booking.priceMinor || p.currency !== p.booking.currency)
        add('PAYMENT_SNAPSHOT_MISMATCH');
      if (p.capturedAt && p.booking.status === 'PAYMENT_PENDING')
        add('CAPTURE_WITH_PENDING_BOOKING');
      if (p.requiresReview) add('CAPTURE_REQUIRES_REFUND_REVIEW');
      if (p.capturedAt && !p.earning) add('MISSING_EARNING');
      if (p.capturedAt && ledger.filter((l) => l.sourceId === p.id).length !== 3)
        add('MISSING_CAPTURE_LEDGER');
      if (p.earning?.settlementItem?.settlement.status === 'PAID' && !p.earning.settled)
        add('SETTLEMENT_EARNING_MISMATCH');
      const successfulRefunds = p.refunds
        .filter((r) => r.status === 'SUCCESS')
        .reduce((sum, r) => sum + r.amount, 0);
      if (
        successfulRefunds !== p.refundedAmount ||
        (p.earning && p.earning.refundAmount !== successfulRefunds)
      )
        add('EARNING_REFUND_MISMATCH');
      if (p.earning) {
        const e = p.earning;
        if (
          e.grossAmount !== p.amount ||
          e.currency !== p.currency ||
          e.netAmount !== e.grossAmount - e.commissionAmount - e.refundAmount + e.commissionReversed
        )
          add('FINANCIAL_TOTAL_MISMATCH');
        if (e.settled && e.settlementItem?.settlement.status !== 'PAID')
          add('SETTLED_WITHOUT_VALID_SETTLEMENT');
        const capture = ledger.filter((l) => l.sourceId === p.id);
        for (const [account, amount] of [
          ['provider_clearing', p.amount],
          ['platform_revenue', e.commissionAmount],
          ['gym_payable', e.grossAmount - e.commissionAmount],
        ] as const)
          if (
            !capture.some(
              (l) => l.account === account && l.amount === amount && l.currency === p.currency,
            )
          )
            add('PAYMENT_LEDGER_AMOUNT_MISMATCH');
        const s = e.settlementItem?.settlement;
        if (s?.status === 'PAID' || s?.status === 'REVERSED') {
          if (
            !ledger.some(
              (l) =>
                l.sourceId === s.id &&
                l.category === 'SETTLEMENT' &&
                l.account === 'gym_payable' &&
                l.amount === -s.netAmount &&
                l.currency === s.currency,
            )
          )
            add('SETTLEMENT_LEDGER_MISMATCH');
          if (
            s.status === 'REVERSED' &&
            !ledger.some(
              (l) =>
                l.sourceId === s.id &&
                l.category === 'SETTLEMENT_REVERSAL' &&
                l.amount === s.netAmount &&
                l.currency === s.currency,
            )
          )
            add('MISSING_SETTLEMENT_REVERSAL');
        }
      }
      for (const r of p.refunds) {
        if (r.status === 'SUCCESS' && ledger.filter((l) => l.sourceId === r.id).length !== 3)
          findings.push({ code: 'MISSING_REFUND_LEDGER', entityId: r.id });
        if (['CREATED', 'PENDING', 'PROCESSING'].includes(r.status))
          findings.push({
            code: r.providerRefundId
              ? 'REFUND_STATUS_RECONCILIATION_REQUIRED'
              : 'UNCERTAIN_REFUND_OPERATION',
            entityId: r.id,
          });
      }
    }
    const [missing, uncertain] = await Promise.all([
      tx.booking.findMany({
        where: { status: 'CONFIRMED', OR: [{ payment: null }, { payment: { capturedAt: null } }] },
        select: { id: true },
        take: 500,
      }),
      tx.paymentAttempt.findMany({
        where: {
          status: { in: ['UNKNOWN', 'DISPATCHING'] },
          createdAt: { lt: new Date(Date.now() - 60000) },
        },
        select: { id: true },
        take: 500,
      }),
    ]);
    findings.push(
      ...missing.map((x) => ({ code: 'CONFIRMED_WITHOUT_CAPTURE', entityId: x.id })),
      ...uncertain.map((x) => ({ code: 'UNCERTAIN_PROVIDER_OPERATION', entityId: x.id })),
    );
    const settlements = await tx.settlement.findMany({
      take: 500,
      orderBy: { id: 'asc' },
      ...(afterSettlement ? { cursor: { id: afterSettlement }, skip: 1 } : {}),
      include: { items: true, reversal: true },
    });
    const settlementLedger = await tx.financialLedgerEntry.findMany({
      where: { sourceId: { in: settlements.map((s) => s.id) } },
    });
    for (const s of settlements) {
      if (
        ['PAID', 'REVERSED'].includes(s.status) &&
        !settlementLedger.some(
          (l) =>
            l.sourceId === s.id &&
            l.category === 'SETTLEMENT' &&
            l.account === 'gym_payable' &&
            l.amount === -s.netAmount &&
            l.currency === s.currency,
        )
      )
        findings.push({ code: 'SETTLEMENT_LEDGER_MISMATCH', entityId: s.id });
      if (
        s.status === 'REVERSED' &&
        !settlementLedger.some(
          (l) =>
            l.sourceId === s.id &&
            l.category === 'SETTLEMENT_REVERSAL' &&
            l.account === 'gym_payable' &&
            l.amount === s.netAmount &&
            l.currency === s.currency,
        )
      )
        findings.push({ code: 'MISSING_SETTLEMENT_REVERSAL', entityId: s.id });
      if (new Set(s.items.map((i) => i.earningId)).size !== s.items.length)
        findings.push({ code: 'DUPLICATE_SETTLEMENT_EARNING', entityId: s.id });
      if (
        s.items.reduce((sum, i) => sum + i.amount, 0) !== s.netAmount ||
        s.netAmount !== s.grossAmount - s.commissionAmount - s.refundAmount
      )
        findings.push({ code: 'FINANCIAL_TOTAL_MISMATCH', entityId: s.id });
      if (s.status === 'REVERSED' && !s.reversal)
        findings.push({ code: 'MISSING_SETTLEMENT_REVERSAL', entityId: s.id });
    }
    return {
      findings,
      scannedPayments: payments.length,
      scannedSettlements: settlements.length,
      nextSettlementCursor: settlements.length === 500 ? settlements.at(-1)?.id : null,
      nextCursor: payments.length === 500 ? payments.at(-1)?.id : null,
      ancillaryResultsMayBeTruncated: missing.length === 500 || uncertain.length === 500,
      mode: 'REPORT_ONLY',
    };
  }
}
