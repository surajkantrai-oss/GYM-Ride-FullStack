import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import { PaymentsService } from '../src/finance/payments.service';
import { RefundsService } from '../src/finance/refunds.service';
import { SettlementsService } from '../src/finance/settlements.service';
import { CommissionService, RefundPolicy } from '../src/finance/finance-policy';
import { DevelopmentPaymentProvider } from '../src/finance/providers/development-payment.provider';
import { DevelopmentPayoutProvider } from '../src/finance/providers/payout-provider';
import { sign } from '../src/finance/providers/signatures';
import { FinanceQueriesService } from '../src/finance/finance-queries.service';
import { GymAccessService } from '../src/gym-access/gym-access.service';
import { ReconciliationService } from '../src/finance/reconciliation.service';

describe('PostgreSQL finance concurrency (isolated database, simulated money only)', () => {
  const url = process.env.FINANCE_TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/gymride_finance_test')
    throw new Error('Use test/run-finance-runtime.cjs');
  const prisma = new PrismaService({ datasourceUrl: url });
  const provider = new DevelopmentPaymentProvider('runtime-test-secret');
  const config = new ConfigService();
  const refunds = new RefundsService(prisma, provider, new RefundPolicy(config));
  const payments = new PaymentsService(prisma, provider, new CommissionService(config), refunds);
  const settlements = new SettlementsService(prisma, new DevelopmentPayoutProvider());
  const queries = new FinanceQueriesService(prisma, new GymAccessService(prisma));
  const reconciliation = new ReconciliationService(prisma);
  afterAll(async () => prisma.$disconnect());

  it.each(['amount', 'currency', 'paymentId', 'reference'])(
    'rejects verified refund %s mismatch without ledger changes',
    async (field) => {
      const f = await ordered();
      await f.verify();
      const refund = await prisma.refund.create({
        data: {
          paymentId: f.payment.id,
          amount: 50000,
          reason: 'Mismatch test',
          requestedBy: f.user.id,
          idempotencyKey: randomUUID(),
          status: 'PROCESSING',
        },
      });
      const result = {
        id: randomUUID(),
        paymentId: f.receipt.paymentId,
        amount: 50000,
        currency: 'INR',
        reference: refund.id,
        status: 'processed' as const,
      };
      const invalid = { ...result, [field]: field === 'amount' ? 60000 : 'wrong' };
      await expect(refunds.applyResult(refund.id, invalid)).rejects.toThrow();
      expect(await prisma.financialLedgerEntry.count({ where: { sourceId: refund.id } })).toBe(0);
      expect(
        (await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).refundedAmount,
      ).toBe(0);
    },
  );
  it('late capture records liability but never reclaims expired reservation', async () => {
    const f = await ordered();
    await prisma.booking.update({
      where: { id: f.booking.id },
      data: { status: 'EXPIRED', reservationExpiresAt: new Date(0) },
    });
    await Promise.all([f.verify(), f.webhook()]);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).requiresReview,
    ).toBe(true);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).status).toBe(
      'EXPIRED',
    );
    await expect(
      settlements.generate(f.user.id, f.gym.id, new Date(0), new Date(), randomUUID()),
    ).rejects.toThrow();
  });
  it('refund idempotency includes policy override and does not double deduct', async () => {
    const f = await ordered();
    await f.verify();
    const key = randomUUID();
    await Promise.all([
      refunds.request(f.user.id, f.payment.id, 50000, 'Same refund request', key),
      refunds.request(f.user.id, f.payment.id, 50000, 'Same refund request', key),
    ]);
    expect(await prisma.refund.count({ where: { paymentId: f.payment.id } })).toBe(1);
    await expect(
      refunds.request(f.user.id, f.payment.id, 50000, 'Same refund request', key, true),
    ).rejects.toThrow();
  });
  it('retains an unknown signed refund event without creating a refund', async () => {
    const result = await provider.refundPayment('unknown-payment', 50000, randomUUID());
    const body = Buffer.from(
      JSON.stringify({
        event: 'refund.processed',
        payload: { refund: { entity: { id: result.id } } },
      }),
    );
    const id = randomUUID();
    await expect(
      payments.webhook('development', id, body, sign(body, 'runtime-test-secret')),
    ).resolves.toMatchObject({ reconciliationRequired: true });
    expect(
      (
        await prisma.paymentWebhookEvent.findUniqueOrThrow({
          where: { provider_providerEventId: { provider: 'development', providerEventId: id } },
        })
      ).processingStatus,
    ).toBe('UNMATCHED');
    expect(await prisma.refund.count({ where: { providerRefundId: result.id } })).toBe(0);
  });

  it('reports earning/refund total mismatch without modifying it', async () => {
    const f = await ordered();
    await f.verify();
    await prisma.gymEarning.update({
      where: { paymentId: f.payment.id },
      data: { refundAmount: 1, netAmount: 84999 },
    });
    const report = (await reconciliation.inspect()) as {
      findings: { code: string; entityId: string }[];
    };
    expect(report.findings).toContainEqual({
      code: 'EARNING_REFUND_MISMATCH',
      entityId: f.payment.id,
    });
    expect(
      (await prisma.gymEarning.findUniqueOrThrow({ where: { paymentId: f.payment.id } }))
        .refundAmount,
    ).toBe(1);
  });

  async function fixture() {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@finance-test.invalid`,
        firstName: 'Finance',
        lastName: 'Test',
        status: 'ACTIVE',
      },
    });
    const gym = await prisma.gym.create({
      data: { name: 'Isolated finance runtime fixture', ownerId: user.id },
    });
    const branch = await prisma.gymBranch.create({
      data: {
        gymId: gym.id,
        name: 'Test',
        address: 'Test',
        city: 'Test',
        state: 'Test',
        postalCode: '000000',
        latitude: 0,
        longitude: 0,
      },
    });
    const plan = await prisma.gymPlan.create({
      data: { gymId: gym.id, name: 'Test', type: 'DAY_PASS', priceMinor: 100000, durationDays: 1 },
    });
    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        gymId: gym.id,
        branchId: branch.id,
        planId: plan.id,
        status: 'PAYMENT_PENDING',
        planName: plan.name,
        planType: plan.type,
        priceMinor: 100000,
        currency: 'INR',
        idempotencyKey: randomUUID(),
        requestFingerprint: '0'.repeat(64),
        reservationExpiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { user, gym, booking };
  }
  async function ordered() {
    const f = await fixture();
    await payments.createOrder(f.user.id, f.booking.id);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId: f.booking.id } });
    const receipt = provider.simulate(payment.providerOrderId!, payment.amount, payment.currency);
    const verify = () =>
      payments.verify(
        f.user.id,
        payment.id,
        payment.providerOrderId!,
        receipt.paymentId,
        receipt.signature,
      );
    const body = Buffer.from(
      JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: receipt.paymentId, order_id: payment.providerOrderId } },
        },
      }),
    );
    const eventId = randomUUID();
    const webhook = () =>
      payments.webhook('development', eventId, body, sign(body, 'runtime-test-secret'));
    return { ...f, payment, receipt, verify, webhook };
  }
  async function assertCapture(id: string, bookingId: string) {
    expect(await prisma.gymEarning.count({ where: { paymentId: id } })).toBe(1);
    expect(await prisma.financialLedgerEntry.count({ where: { sourceId: id } })).toBe(3);
    expect(await prisma.bookingEvent.count({ where: { bookingId, toStatus: 'CONFIRMED' } })).toBe(
      1,
    );
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(
      'CONFIRMED',
    );
  }
  it('concurrent order creation dispatches one logical order from server amount', async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled([
      payments.createOrder(f.user.id, f.booking.id),
      payments.createOrder(f.user.id, f.booking.id),
    ]);
    expect(outcomes.some((x) => x.status === 'fulfilled')).toBe(true);
    expect(await prisma.payment.count({ where: { bookingId: f.booking.id } })).toBe(1);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId: f.booking.id } });
    expect(payment.amount).toBe(100000);
    expect(await prisma.paymentAttempt.count({ where: { paymentId: payment.id } })).toBe(1);
  });
  it.each(['verification', 'webhook', 'mixed'])(
    'deduplicates concurrent %s capture',
    async (mode) => {
      const f = await ordered();
      await Promise.all(
        mode === 'verification'
          ? [f.verify(), f.verify()]
          : mode === 'webhook'
            ? [f.webhook(), f.webhook()]
            : [f.verify(), f.webhook()],
      );
      await assertCapture(f.payment.id, f.booking.id);
    },
  );
  it.each([100000, 70000])(
    'prevents concurrent refund over-allocation of %i paise',
    async (amount) => {
      const f = await ordered();
      await f.verify();
      const outcomes = await Promise.allSettled([
        refunds.request(f.user.id, f.payment.id, amount, 'Concurrency test', randomUUID()),
        refunds.request(f.user.id, f.payment.id, amount, 'Concurrency test', randomUUID()),
      ]);
      expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } });
      expect(payment.refundedAmount).toBe(amount);
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).status).toBe(
        amount === 100000 ? 'REFUNDED' : 'CONFIRMED',
      );
      expect(
        (await prisma.gymEarning.findUniqueOrThrow({ where: { paymentId: payment.id } })).netAmount,
      ).toBe(amount === 100000 ? 0 : 25500);
    },
  );
  it('deduplicates refund webhook/API result and ignores older pending events', async () => {
    const f = await ordered();
    await f.verify();
    const refund = await prisma.refund.create({
      data: {
        paymentId: f.payment.id,
        amount: 50000,
        reason: 'Asynchronous test',
        requestedBy: f.user.id,
        idempotencyKey: randomUUID(),
        status: 'PROCESSING',
      },
    });
    const result = await provider.refundPayment(f.receipt.paymentId, 50000, refund.id);
    const body = Buffer.from(
      JSON.stringify({
        event: 'refund.processed',
        payload: { refund: { entity: { id: result.id } } },
      }),
    );
    const eventId = randomUUID();
    const deliver = () =>
      payments.webhook('development', eventId, body, sign(body, 'runtime-test-secret'));
    await Promise.all([refunds.applyResult(refund.id, result), deliver(), deliver()]);
    await refunds.applyResult(refund.id, { ...result, status: 'pending' });
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe(
      'SUCCESS',
    );
    expect(await prisma.financialLedgerEntry.count({ where: { sourceId: refund.id } })).toBe(3);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).refundedAmount,
    ).toBe(50000);
  });
  it('records failed refund without deducting earnings and permits a new request', async () => {
    const f = await ordered();
    await f.verify();
    const refund = await prisma.refund.create({
      data: {
        paymentId: f.payment.id,
        amount: 100000,
        reason: 'Failure test',
        requestedBy: f.user.id,
        idempotencyKey: randomUUID(),
        status: 'PROCESSING',
      },
    });
    await refunds.applyResult(refund.id, {
      id: randomUUID(),
      paymentId: f.receipt.paymentId,
      amount: 100000,
      status: 'failed',
    });
    expect(await prisma.financialLedgerEntry.count({ where: { sourceId: refund.id } })).toBe(0);
    await refunds.request(f.user.id, f.payment.id, 100000, 'Retry failed refund', randomUUID());
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).refundedAmount,
    ).toBe(100000);
  });
  it('prevents concurrent double allocation, payout completion, and reversal', async () => {
    const f = await ordered();
    await f.verify();
    const start = new Date(0);
    const end = new Date();
    const results = await Promise.allSettled([
      settlements.generate(f.user.id, f.gym.id, start, end, randomUUID()),
      settlements.generate(f.user.id, f.gym.id, start, end, randomUUID()),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const settlement = await prisma.settlement.findFirstOrThrow({ where: { gymId: f.gym.id } });
    await Promise.all([
      settlements.process(f.user.id, settlement.id),
      settlements.process(f.user.id, settlement.id),
    ]);
    expect(
      await prisma.financialLedgerEntry.count({
        where: { sourceId: settlement.id, category: 'SETTLEMENT' },
      }),
    ).toBe(1);
    const key = randomUUID();
    await Promise.all([
      settlements.reverse(f.user.id, settlement.id, 'Verified simulated reversal', key),
      settlements.reverse(f.user.id, settlement.id, 'Verified simulated reversal', key),
    ]);
    expect(await prisma.settlementReversal.count({ where: { settlementId: settlement.id } })).toBe(
      1,
    );
    expect(await prisma.financialLedgerEntry.count({ where: { sourceId: settlement.id } })).toBe(2);
    expect(
      (
        await prisma.financialLedgerEntry.aggregate({
          where: { sourceId: settlement.id },
          _sum: { amount: true },
        })
      )._sum.amount,
    ).toBe(0);
    expect(
      (await prisma.gymEarning.findUniqueOrThrow({ where: { paymentId: f.payment.id } })).settled,
    ).toBe(false);
    await expect(
      settlements.generate(f.user.id, f.gym.id, start, new Date(), randomUUID()),
    ).rejects.toThrow();
    await expect(settlements.process(f.user.id, settlement.id)).rejects.toThrow();
    await expect(
      settlements.reverse(f.user.id, settlement.id, 'Conflicting reason', key),
    ).rejects.toThrow();
  });
  it('database rejects ledger edits and payment snapshot tampering', async () => {
    const f = await ordered();
    await f.verify();
    const entry = await prisma.financialLedgerEntry.findFirstOrThrow({
      where: { sourceId: f.payment.id },
    });
    await expect(
      prisma.financialLedgerEntry.update({ where: { id: entry.id }, data: { amount: 1 } }),
    ).rejects.toThrow();
    await expect(prisma.financialLedgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
    await expect(
      prisma.payment.update({ where: { id: f.payment.id }, data: { amount: 1 } }),
    ).rejects.toThrow();
  });
  it('denies partner IDOR for payments, earnings and settlements', async () => {
    const f = await ordered();
    await f.verify();
    const other = await fixture();
    const user = { id: other.user.id, roles: ['GYM_OWNER'] as never, sessionId: 'test' };
    const earning = await prisma.gymEarning.findUniqueOrThrow({
      where: { paymentId: f.payment.id },
    });
    await settlements.generate(f.user.id, f.gym.id, new Date(0), new Date(), randomUUID());
    const settlement = await prisma.settlement.findFirstOrThrow({ where: { gymId: f.gym.id } });
    await expect(queries.detail('payments', f.payment.id, user)).rejects.toThrow();
    await expect(queries.detail('earnings', earning.id, user)).rejects.toThrow();
    await expect(queries.detail('settlements', settlement.id, user)).rejects.toThrow();
  });
});
