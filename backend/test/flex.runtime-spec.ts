import { ConfigService } from '@nestjs/config';
import { CheckInMethod, RoleName } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CheckInLifecycleService } from '../src/check-ins/check-in-lifecycle.service';
import { CheckInPolicy } from '../src/check-ins/check-in.policy';
import { CheckInService } from '../src/check-ins/check-in.service';
import { PrismaService } from '../src/database/prisma.service';
import { DevelopmentPaymentProvider } from '../src/finance/providers/development-payment.provider';
import { FlexService } from '../src/flex/flex.service';
import { FlexUsagePolicy } from '../src/flex/flex.policy';
import { GymAccessService } from '../src/gym-access/gym-access.service';

describe('PostgreSQL Flex entitlement concurrency (isolated test database)', () => {
  const url = process.env.FINANCE_TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/gymride_finance_test') throw new Error('Use test/run-finance-runtime.cjs');
  const prisma = new PrismaService({ datasourceUrl: url });
  const provider = new DevelopmentPaymentProvider('runtime-flex-secret');
  const lifecycle = { scheduleBooking: jest.fn(() => Promise.resolve()) } as unknown as CheckInLifecycleService;
  const flex = new FlexService(prisma, provider, new GymAccessService(prisma), lifecycle, new FlexUsagePolicy());
  const policy = new CheckInPolicy(new ConfigService({ CHECK_IN_OPEN_BEFORE_MINUTES: 15, CHECK_IN_CLOSE_AFTER_MINUTES: 30, CHECK_IN_COMPLETION_GRACE_MINUTES: 15 }));
  const checkIns = new CheckInService(prisma, policy);
  afterAll(async () => prisma.$disconnect());

  async function fixture(limit = 1, withSecondary = false) {
    const customer = await prisma.user.create({ data: { email: `${randomUUID()}@flex.invalid`, status: 'ACTIVE' } });
    const owner = await prisma.user.create({ data: { email: `${randomUUID()}@flex.invalid`, status: 'ACTIVE' } });
    const city = await prisma.serviceCity.create({ data: { code: randomUUID(), name: `City ${randomUUID()}`, state: 'Test' } });
    const otherCity = await prisma.serviceCity.create({ data: { code: randomUUID(), name: `City ${randomUUID()}`, state: 'Test' } });
    const flexPlan = await prisma.flexPlan.create({ data: { name: 'Runtime Flex', code: randomUUID(), status: 'ACTIVE', priceMinor: 200000, durationDays: 30, totalUsageLimit: withSecondary ? 2 : limit, primaryCityLimit: limit, secondaryCityLimit: withSecondary ? 1 : 0, dailyUsageLimit: withSecondary ? 2 : limit, bookingAdvanceDays: 14 } });
    const gym = await prisma.gym.create({ data: { name: 'Flex runtime gym', ownerId: owner.id, status: 'APPROVED' } });
    const branch = await prisma.gymBranch.create({ data: { gymId: gym.id, name: 'Flex Branch', address: 'Test', city: city.name, state: city.state, postalCode: '000000', latitude: 0, longitude: 0, status: 'ACTIVE' } });
    const gymPlan = await prisma.gymPlan.create({ data: { gymId: gym.id, name: 'Flex day pass', type: 'DAY_PASS', status: 'ACTIVE', priceMinor: 100000, durationDays: 1, branches: { create: { branchId: branch.id } } } });
    const participation = await prisma.gymFlexParticipation.create({ data: { gymId: gym.id, branchId: branch.id, serviceCityId: city.id, enabled: true, reimbursementRules: { create: { amountMinor: 65000, version: 'runtime-v1', effectiveFrom: new Date(Date.now() - 60_000) } } } });
    const slotData = (offset: number) => ({ branchId: branch.id, startAt: new Date(Date.now() + offset * 60_000), endAt: new Date(Date.now() + (offset + 60) * 60_000), capacity: 10 });
    const [slot, secondSlot] = await Promise.all([prisma.slotInstance.create({ data: slotData(60) }), prisma.slotInstance.create({ data: slotData(180) })]);
    const checkout = await flex.purchase(customer.id, { planId: flexPlan.id, primaryCityId: city.id, ...(withSecondary ? { secondaryCityId: otherCity.id } : {}) }, `purchase-${randomUUID()}`) as { paymentId: string };
    await flex.simulate(customer.id, checkout.paymentId);
    return { customer, owner, city, otherCity, flexPlan, gym, branch, gymPlan, participation, slot, secondSlot };
  }

  it('activates a server-priced subscription and reuses its purchase idempotently', async () => {
    const customer = await prisma.user.create({ data: { email: `${randomUUID()}@flex.invalid`, status: 'ACTIVE' } });
    const city = await prisma.serviceCity.create({ data: { code: randomUUID(), name: `City ${randomUUID()}`, state: 'Test' } });
    const plan = await prisma.flexPlan.create({ data: { name: 'Idempotent Flex', code: randomUUID(), status: 'ACTIVE', priceMinor: 123400, durationDays: 30, totalUsageLimit: 2, primaryCityLimit: 2, secondaryCityLimit: 0 } });
    const key = `purchase-${randomUUID()}`;
    const first = await flex.purchase(customer.id, { planId: plan.id, primaryCityId: city.id }, key) as { paymentId: string; amount: number };
    const second = await flex.purchase(customer.id, { planId: plan.id, primaryCityId: city.id }, key) as { paymentId: string };
    expect(second.paymentId).toBe(first.paymentId); expect(first.amount).toBe(123400);
    await flex.simulate(customer.id, first.paymentId);
    await expect(flex.simulate(customer.id, first.paymentId)).resolves.toMatchObject({ status: 'ACTIVE' });
    const subscription = await prisma.flexSubscription.findFirstOrThrow({ where: { customerId: customer.id } });
    expect(subscription.status).toBe('ACTIVE');
    expect(await prisma.flexUsagePeriod.count({ where: { subscriptionId: subscription.id } })).toBe(1);
  });

  it('rejects an expired subscription even when its stored status is still active', async () => {
    const f = await fixture(1);
    await prisma.flexSubscription.updateMany({ where: { customerId: f.customer.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await expect(flex.createBooking(f.customer.id, { branchId: f.branch.id, planId: f.gymPlan.id, slotId: f.slot.id }, `booking-${randomUUID()}`)).rejects.toMatchObject({ response: { code: 'FLEX_SUBSCRIPTION_INACTIVE' } });
  });

  it('accepts the selected secondary city and enforces its independent limit', async () => {
    const f = await fixture(1, true);
    await prisma.gymFlexParticipation.update({ where: { id: f.participation.id }, data: { serviceCityId: f.otherCity.id } });
    await expect(flex.createBooking(f.customer.id, { branchId: f.branch.id, planId: f.gymPlan.id, slotId: f.slot.id }, `booking-${randomUUID()}`)).resolves.toBeDefined();
    await expect(flex.createBooking(f.customer.id, { branchId: f.branch.id, planId: f.gymPlan.id, slotId: f.secondSlot.id }, `booking-${randomUUID()}`)).rejects.toMatchObject({ response: { code: 'FLEX_CITY_LIMIT_REACHED' } });
  });

  it('prevents a partner from reading another gym participation', async () => {
    const f = await fixture(1);
    const outsider = await prisma.user.create({ data: { email: `${randomUUID()}@flex.invalid`, status: 'ACTIVE' } });
    await expect(flex.getParticipation({ id: outsider.id, sessionId: randomUUID(), roles: [RoleName.GYM_OWNER] }, f.gym.id)).rejects.toBeDefined();
    await expect(flex.getParticipation({ id: f.owner.id, sessionId: randomUUID(), roles: [RoleName.GYM_OWNER] }, f.gym.id)).resolves.toHaveLength(1);
  });

  it('allows exactly one reservation when concurrent requests race for the last usage', async () => {
    const f = await fixture(1);
    const outcomes = await Promise.allSettled([
      flex.createBooking(f.customer.id, { branchId: f.branch.id, planId: f.gymPlan.id, slotId: f.slot.id }, `booking-${randomUUID()}`),
      flex.createBooking(f.customer.id, { branchId: f.branch.id, planId: f.gymPlan.id, slotId: f.secondSlot.id }, `booking-${randomUUID()}`),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.flexUsage.count({ where: { customerId: f.customer.id, status: 'RESERVED' } })).toBe(1);
  });

  it('rejects a branch outside selected cities and releases quota on cancellation', async () => {
    const f = await fixture(1);
    await prisma.gymFlexParticipation.update({ where: { id: f.participation.id }, data: { serviceCityId: f.otherCity.id } });
    await expect(flex.createBooking(f.customer.id, { branchId: f.branch.id, planId: f.gymPlan.id, slotId: f.slot.id }, `booking-${randomUUID()}`)).rejects.toMatchObject({ response: { code: 'FLEX_CITY_NOT_ELIGIBLE' } });
    await prisma.gymFlexParticipation.update({ where: { id: f.participation.id }, data: { serviceCityId: f.city.id } });
    const booking = await flex.createBooking(f.customer.id, { branchId: f.branch.id, planId: f.gymPlan.id, slotId: f.slot.id }, `booking-${randomUUID()}`) as { id: string };
    await flex.cancelBooking(f.customer.id, booking.id);
    expect((await prisma.flexUsage.findUniqueOrThrow({ where: { bookingId: booking.id } })).status).toBe('RELEASED');
    await expect(flex.createBooking(f.customer.id, { branchId: f.branch.id, planId: f.gymPlan.id, slotId: f.secondSlot.id }, `booking-${randomUUID()}`)).resolves.toBeDefined();
  });

  it('consumes usage and creates one reimbursement earning and ledger entry at verified check-in', async () => {
    const f = await fixture(1);
    const booking = await flex.createBooking(f.customer.id, { branchId: f.branch.id, planId: f.gymPlan.id, slotId: f.slot.id }, `booking-${randomUUID()}`) as { id: string };
    const checkIn = await prisma.checkIn.create({ data: { bookingId: booking.id, customerId: f.customer.id, gymId: f.gym.id, branchId: f.branch.id } });
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CHECK_IN_AVAILABLE' } });
    await prisma.$transaction((tx) => checkIns.verifyInTransaction(tx, booking.id, checkIn.id, f.owner.id, CheckInMethod.QR, f.slot.startAt));
    const usage = await prisma.flexUsage.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(usage.status).toBe('CONSUMED');
    expect(await prisma.gymEarning.count({ where: { flexUsageId: usage.id, netAmount: 65000 } })).toBe(1);
    expect(await prisma.financialLedgerEntry.count({ where: { sourceId: usage.id, category: 'FLEX_REIMBURSEMENT', amount: 65000 } })).toBe(1);
  });
});
