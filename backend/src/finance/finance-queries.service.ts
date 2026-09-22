import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma, RefundStatus, SettlementStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { AuthUser } from '../common/types/auth-user';
import { ApiErrorCode as E } from '../common/errors/api-error-code';
import { pageMeta } from '../common/dto/pagination.dto';
import { financeError } from './finance-policy';
import { FinanceQueryDto } from './finance.dto';

export const financeResources = [
  'payments',
  'refunds',
  'earnings',
  'settlements',
  'ledger',
] as const;
export type FinanceResource = (typeof financeResources)[number];

@Injectable()
export class FinanceQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
  ) {}
  async authorize(user: AuthUser, query: FinanceQueryDto, settlements = false): Promise<void> {
    if (settlements) {
      if (!query.gymId) financeError(E.FORBIDDEN, 'Select an authorized gym', 403);
      await this.access.assertGymManagement(user, query.gymId);
      return;
    }
    if (query.branchId) {
      const branch = await this.access.assertBranchManagement(user, query.branchId);
      if (query.gymId && branch.gymId !== query.gymId)
        financeError(E.FORBIDDEN, 'Branch does not belong to selected gym', 403);
    } else if (query.gymId) await this.access.assertGymManagement(user, query.gymId);
    else financeError(E.FORBIDDEN, 'Select an authorized gym or branch', 403);
  }
  private dates(q: FinanceQueryDto): Prisma.DateTimeFilter | undefined {
    if (q.from && q.to && new Date(q.from) > new Date(q.to))
      financeError(E.VALIDATION_FAILED, 'Date range is reversed', 400);
    return q.from || q.to
      ? {
          ...(q.from ? { gte: new Date(q.from) } : {}),
          ...(q.to
            ? /^\d{4}-\d{2}-\d{2}$/.test(q.to)
              ? { lt: new Date(new Date(q.to).getTime() + 86400000) }
              : { lte: new Date(q.to) }
            : {}),
        }
      : undefined;
  }
  async list(resource: FinanceResource, q: FinanceQueryDto): Promise<unknown> {
    const booking = { gymId: q.gymId, branchId: q.branchId, id: q.bookingId };
    const paging = { skip: (q.page - 1) * q.limit, take: q.limit };
    const createdAt = this.dates(q);
    let data: unknown[];
    let total: number;
    switch (resource) {
      case 'payments': {
        if (q.status && !Object.values(PaymentStatus).includes(q.status as PaymentStatus))
          financeError(E.VALIDATION_FAILED, 'Invalid payment status', 400);
        const where: Prisma.PaymentWhereInput = {
          booking,
          createdAt,
          status: q.status as PaymentStatus | undefined,
        };
        [data, total] = await Promise.all([
          this.prisma.payment.findMany({ where, ...paging, orderBy: { createdAt: 'desc' } }),
          this.prisma.payment.count({ where }),
        ]);
        break;
      }
      case 'refunds': {
        if (q.status && !Object.values(RefundStatus).includes(q.status as RefundStatus))
          financeError(E.VALIDATION_FAILED, 'Invalid refund status', 400);
        const where: Prisma.RefundWhereInput = {
          payment: { booking },
          createdAt,
          status: q.status as RefundStatus | undefined,
        };
        [data, total] = await Promise.all([
          this.prisma.refund.findMany({ where, ...paging, orderBy: { createdAt: 'desc' } }),
          this.prisma.refund.count({ where }),
        ]);
        break;
      }
      case 'earnings': {
        if (q.status && !['PAID', 'PENDING'].includes(q.status))
          financeError(E.VALIDATION_FAILED, 'Earnings status must be PAID or PENDING', 400);
        const where: Prisma.GymEarningWhereInput = {
          payment: { booking },
          createdAt,
          ...(q.status === 'PAID'
            ? { settled: true }
            : q.status === 'PENDING'
              ? { settled: false }
              : {}),
        };
        [data, total] = await Promise.all([
          this.prisma.gymEarning.findMany({ where, ...paging, orderBy: { createdAt: 'desc' } }),
          this.prisma.gymEarning.count({ where }),
        ]);
        break;
      }
      case 'settlements': {
        if (q.branchId)
          financeError(
            E.VALIDATION_FAILED,
            'Settlements are gym-wide; branch filter is not supported',
            400,
          );
        if (q.status && !Object.values(SettlementStatus).includes(q.status as SettlementStatus))
          financeError(E.VALIDATION_FAILED, 'Invalid settlement status', 400);
        const where: Prisma.SettlementWhereInput = {
          gymId: q.gymId,
          generatedAt: createdAt,
          status: q.status as SettlementStatus | undefined,
        };
        [data, total] = await Promise.all([
          this.prisma.settlement.findMany({ where, ...paging, orderBy: { generatedAt: 'desc' } }),
          this.prisma.settlement.count({ where }),
        ]);
        break;
      }
      case 'ledger': {
        const where = { gymId: q.gymId, branchId: q.branchId, createdAt };
        [data, total] = await Promise.all([
          this.prisma.financialLedgerEntry.findMany({
            where,
            ...paging,
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.financialLedgerEntry.count({ where }),
        ]);
        break;
      }
    }
    return { data, meta: pageMeta(q.page, q.limit, total) };
  }
  async detail(resource: FinanceResource, id: string, user?: AuthUser): Promise<unknown> {
    if (resource === 'settlements') {
      const item = await this.prisma.settlement.findUnique({
        where: { id },
        include: { items: true, reversal: true },
      });
      if (!item) financeError(E.SETTLEMENT_NOT_FOUND, 'Settlement not found', 404);
      if (user) await this.access.assertGymManagement(user, item.gymId);
      return item;
    }
    if (resource === 'payments') {
      const item = await this.prisma.payment.findUnique({
        where: { id },
        include: { booking: true, refunds: true, earning: true, attempts: true },
      });
      if (!item) financeError(E.PAYMENT_NOT_FOUND, 'Payment not found', 404);
      if (user) await this.access.assertBranchManagement(user, item.booking.branchId);
      const { booking, ...safe } = item;
      return {
        ...safe,
        booking: {
          id: booking.id,
          gymId: booking.gymId,
          branchId: booking.branchId,
          status: booking.status,
        },
      };
    }
    if (resource === 'earnings') {
      const item = await this.prisma.gymEarning.findUnique({
        where: { id },
        include: { payment: { include: { booking: true } }, settlementItem: true },
      });
      if (!item) financeError(E.NOT_FOUND, 'Earning not found', 404);
      if (user) await this.access.assertBranchManagement(user, item.payment.booking.branchId);
      const { payment, ...safe } = item;
      return {
        ...safe,
        bookingId: payment.bookingId,
        gymId: payment.booking.gymId,
        branchId: payment.booking.branchId,
      };
    }
    financeError(E.NOT_FOUND, 'Detail resource not supported', 404);
  }
  async summary(q: FinanceQueryDto): Promise<unknown> {
    const where: Prisma.GymEarningWhereInput = {
      payment: { booking: { gymId: q.gymId, branchId: q.branchId } },
      createdAt: this.dates(q),
    };
    const [all, paid, pending, statuses] = await Promise.all([
      this.prisma.gymEarning.aggregate({
        where,
        _sum: {
          grossAmount: true,
          commissionAmount: true,
          commissionReversed: true,
          refundAmount: true,
          netAmount: true,
        },
      }),
      this.prisma.gymEarning.aggregate({
        where: { ...where, settled: true },
        _sum: { netAmount: true },
      }),
      this.prisma.gymEarning.aggregate({
        where: { ...where, settled: false },
        _sum: { netAmount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['status'],
        where: { booking: { gymId: q.gymId, branchId: q.branchId }, createdAt: this.dates(q) },
        _count: { _all: true },
      }),
    ]);
    return {
      currency: 'INR',
      grossRevenue: all._sum.grossAmount ?? 0,
      commission: (all._sum.commissionAmount ?? 0) - (all._sum.commissionReversed ?? 0),
      refunds: all._sum.refundAmount ?? 0,
      netEarnings: all._sum.netAmount ?? 0,
      pendingSettlement: pending._sum.netAmount ?? 0,
      paidSettlement: paid._sum.netAmount ?? 0,
      paymentCounts: statuses.map((s) => ({ status: s.status, count: s._count._all })),
    };
  }
}
