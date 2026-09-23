import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BranchStatus, FlexPlanStatus, FlexSubscriptionStatus, FlexUsageStatus, GymStatus, Prisma, SlotStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ApiErrorCode as E } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { pageMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { PaymentProvider, VerifiedPayment } from '../finance/providers/payment-provider';
import { DevelopmentPaymentProvider } from '../finance/providers/development-payment.provider';
import { CheckInLifecycleService } from '../check-ins/check-in-lifecycle.service';
import { createNotificationIntent } from '../notifications/notification-intent';
import { CreateFlexBookingDto, CreateFlexPlanDto, FlexListDto, ParticipationDto, PurchaseFlexDto, ReimbursementDto, UpdateCityDto, UpdateFlexPlanDto, UpsertCityDto } from './flex.dto';
import { FlexUsagePolicy } from './flex.policy';

const ACTIVE_USAGE = [FlexUsageStatus.RESERVED, FlexUsageStatus.CONSUMED, FlexUsageStatus.FORFEITED];
type ActiveSubscription = Prisma.FlexSubscriptionGetPayload<{ include: { periods: true } }>;

@Injectable()
export class FlexService {
  private readonly logger = new Logger(FlexService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly access: GymAccessService,
    private readonly lifecycle: CheckInLifecycleService,
    private readonly policy: FlexUsagePolicy,
  ) {}

  private fail(code: E, message: string, status = HttpStatus.CONFLICT): never {
    throw new DomainException(code, message, status);
  }
  private async serial<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  cities(): Promise<unknown> {
    return this.prisma.serviceCity.findMany({ where: { active: true }, orderBy: [{ state: 'asc' }, { name: 'asc' }] });
  }
  plans(): Promise<unknown> {
    return this.prisma.flexPlan.findMany({ where: { status: FlexPlanStatus.ACTIVE }, orderBy: { priceMinor: 'asc' } });
  }
  adminPlans(): Promise<unknown> {
    return this.prisma.flexPlan.findMany({ orderBy: [{ createdAt: 'desc' }, { name: 'asc' }] });
  }
  subscription(customerId: string): Promise<unknown> {
    return this.prisma.flexSubscription.findFirst({
      where: { customerId, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } },
      include: { primaryCity: true, secondaryCity: true, payment: true, periods: { orderBy: { startsAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async usage(customerId: string, q: FlexListDto): Promise<unknown> {
    const where: Prisma.FlexUsageWhereInput = { customerId, status: q.status as FlexUsageStatus | undefined };
    const [data, total] = await Promise.all([
      this.prisma.flexUsage.findMany({ where, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: { createdAt: 'desc' }, include: { gym: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } }, booking: { select: { id: true, status: true, slot: true } } } }),
      this.prisma.flexUsage.count({ where }),
    ]);
    return { data, meta: pageMeta(q.page, q.limit, total) };
  }
  async eligibleGyms(customerId: string, cityId?: string): Promise<unknown> {
    const sub = await this.activeSubscription(customerId);
    const cities = [sub.primaryCityId, sub.secondaryCityId].filter(Boolean) as string[];
    if (cityId && !cities.includes(cityId)) this.fail(E.FLEX_CITY_NOT_ELIGIBLE, 'City is not part of this Flex subscription');
    return this.prisma.gymFlexParticipation.findMany({
      where: { enabled: true, serviceCityId: cityId ?? { in: cities }, gym: { status: GymStatus.APPROVED }, branch: { status: BranchStatus.ACTIVE } },
      include: { serviceCity: true, gym: { select: { id: true, name: true } }, branch: { select: { id: true, name: true, address: true, city: true, timezone: true } } },
      orderBy: { branch: { name: 'asc' } },
    });
  }

  async purchase(customerId: string, dto: PurchaseFlexDto, key: string): Promise<unknown> {
    const fingerprint = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    const intent = await this.serial(async (tx) => {
      const prior = await tx.flexSubscription.findUnique({ where: { customerId_idempotencyKey: { customerId, idempotencyKey: key } }, include: { payment: true } });
      if (prior) {
        const priorFingerprint = createHash('sha256').update(JSON.stringify({ planId: prior.flexPlanId, primaryCityId: prior.primaryCityId, ...(prior.secondaryCityId ? { secondaryCityId: prior.secondaryCityId } : {}) })).digest('hex');
        if (priorFingerprint !== fingerprint) this.fail(E.IDEMPOTENCY_KEY_CONFLICT, 'Idempotency key has different Flex purchase inputs');
        return { subscription: prior, payment: prior.payment!, dispatch: false };
      }
      const open = await tx.flexSubscription.findFirst({ where: { customerId, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } } });
      if (open) this.fail(E.FLEX_SUBSCRIPTION_ALREADY_ACTIVE, 'Customer already has an active or pending Flex subscription');
      const plan = await tx.flexPlan.findUnique({ where: { id: dto.planId } });
      if (!plan) this.fail(E.FLEX_PLAN_NOT_FOUND, 'Flex plan not found', 404);
      if (plan.status !== FlexPlanStatus.ACTIVE) this.fail(E.FLEX_PLAN_INACTIVE, 'Flex plan is not active');
      if (dto.secondaryCityId && dto.secondaryCityId === dto.primaryCityId) this.fail(E.VALIDATION_FAILED, 'Primary and secondary cities must differ', 400);
      const cityIds = [dto.primaryCityId, dto.secondaryCityId].filter(Boolean) as string[];
      if ((await tx.serviceCity.count({ where: { id: { in: cityIds }, active: true } })) !== cityIds.length) this.fail(E.FLEX_CITY_NOT_ELIGIBLE, 'Select active service cities', 422);
      const subscription = await tx.flexSubscription.create({ data: {
        customerId, flexPlanId: plan.id, primaryCityId: dto.primaryCityId, secondaryCityId: dto.secondaryCityId, idempotencyKey: key,
        planName: plan.name, planCode: plan.code, priceMinor: plan.priceMinor, currency: plan.currency, durationDays: plan.durationDays,
        totalUsageLimit: plan.totalUsageLimit, primaryCityLimit: plan.primaryCityLimit, secondaryCityLimit: plan.secondaryCityLimit,
        dailyUsageLimit: plan.dailyUsageLimit, bookingAdvanceDays: plan.bookingAdvanceDays, eligiblePlanTypes: plan.eligiblePlanTypes, policyVersion: plan.policyVersion,
      } });
      const payment = await tx.flexPayment.create({ data: { subscriptionId: subscription.id, provider: this.provider.name, amount: plan.priceMinor, currency: plan.currency } });
      return { subscription, payment, dispatch: true };
    });
    if (intent.dispatch) {
      try {
        const order = await this.provider.createPaymentOrder(intent.payment.id, intent.payment.amount, intent.payment.currency);
        if (order.amount !== intent.payment.amount || order.currency !== intent.payment.currency) this.fail(E.PAYMENT_AMOUNT_MISMATCH, 'Provider order differs from Flex plan');
        intent.payment = await this.prisma.flexPayment.update({ where: { id: intent.payment.id }, data: { providerOrderId: order.id, status: 'PENDING' } });
      } catch (error) {
        await this.prisma.flexPayment.update({ where: { id: intent.payment.id }, data: { status: 'FAILED' } });
        if (error instanceof DomainException) throw error;
        this.fail(E.PAYMENT_ORDER_CREATION_FAILED, 'Flex payment order could not be created', 502);
      }
    }
    return this.checkout(intent.subscription.id, intent.payment);
  }
  private checkout(subscriptionId: string, payment: { id: string; provider: string; providerOrderId: string | null; amount: number; currency: string; status: string }): unknown {
    return { subscriptionId, paymentId: payment.id, provider: payment.provider, orderId: payment.providerOrderId, amount: payment.amount, currency: payment.currency, status: payment.status, ...this.provider.checkoutConfiguration(), simulated: payment.provider === 'development' };
  }
  async verify(customerId: string, paymentId: string, orderId: string, providerPaymentId: string, signature: string): Promise<unknown> {
    const payment = await this.prisma.flexPayment.findFirst({ where: { id: paymentId, subscription: { customerId } } });
    if (!payment) this.fail(E.PAYMENT_NOT_FOUND, 'Flex payment not found', 404);
    if (payment.providerOrderId !== orderId || payment.provider !== this.provider.name) this.fail(E.PAYMENT_VERIFICATION_FAILED, 'Flex payment order mismatch', 400);
    let verified: VerifiedPayment;
    try { verified = await this.provider.verifyPayment(orderId, providerPaymentId, signature); }
    catch { this.fail(E.INVALID_PAYMENT_SIGNATURE, 'Flex payment proof could not be verified', 400); }
    return this.activate(payment.id, verified);
  }
  async simulate(customerId: string, paymentId: string): Promise<unknown> {
    if (!(this.provider instanceof DevelopmentPaymentProvider)) this.fail(E.FORBIDDEN, 'Simulation is disabled', 403);
    const payment = await this.prisma.flexPayment.findFirst({ where: { id: paymentId, subscription: { customerId } } });
    if (!payment?.providerOrderId) this.fail(E.PAYMENT_NOT_FOUND, 'Flex order not found', 404);
    const receipt = this.provider.simulate(payment.providerOrderId, payment.amount, payment.currency);
    return this.verify(customerId, payment.id, payment.providerOrderId, receipt.paymentId, receipt.signature);
  }
  private async activate(paymentId: string, verified: VerifiedPayment): Promise<unknown> {
    return this.serial(async (tx) => {
      const initial = await tx.flexPayment.findUniqueOrThrow({ where: { id: paymentId } });
      await tx.$queryRaw`SELECT id FROM flex_subscriptions WHERE id = ${initial.subscriptionId}::uuid FOR UPDATE`;
      const payment = await tx.flexPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { subscription: true } });
      if (payment.status === 'SUCCESS') return payment.subscription;
      if (verified.orderId !== payment.providerOrderId || verified.amount !== payment.amount || verified.currency !== payment.currency || verified.status !== 'captured') this.fail(E.PAYMENT_AMOUNT_MISMATCH, 'Verified Flex payment does not match immutable plan price', 400);
      const now = new Date(); const endsAt = new Date(now.getTime() + payment.subscription.durationDays * 86_400_000);
      await tx.flexPayment.update({ where: { id: payment.id }, data: { status: 'SUCCESS', providerPaymentId: verified.id, capturedAt: now } });
      const subscription = await tx.flexSubscription.update({ where: { id: payment.subscriptionId }, data: { status: 'ACTIVE', startedAt: now, currentPeriodStart: now, currentPeriodEnd: endsAt, expiresAt: endsAt } });
      await tx.flexUsagePeriod.create({ data: { subscriptionId: subscription.id, startsAt: now, endsAt, totalLimit: subscription.totalUsageLimit, primaryCityLimit: subscription.primaryCityLimit, secondaryCityLimit: subscription.secondaryCityLimit } });
      await tx.user.update({ where: { id: subscription.customerId }, data: { primaryFlexCityId: subscription.primaryCityId, secondaryFlexCityId: subscription.secondaryCityId } });
      await createNotificationIntent(tx, { userId: subscription.customerId, type: 'FLEX_SUBSCRIPTION_ACTIVATED', category: 'FLEX', title: 'GYMRide Flex is active', body: `${subscription.planName} is ready to use.`, route: { screen: 'Flex' }, dedupeKey: `flex-subscription:${subscription.id}:activated` });
      return subscription;
    });
  }

  private async activeSubscription(customerId: string): Promise<ActiveSubscription> {
    const subscription = await this.prisma.flexSubscription.findFirst({ where: { customerId, status: 'ACTIVE', expiresAt: { gt: new Date() } }, include: { periods: { where: { status: 'ACTIVE', endsAt: { gt: new Date() } }, orderBy: { startsAt: 'desc' }, take: 1 } } });
    if (!subscription || !subscription.periods[0]) this.fail(E.FLEX_SUBSCRIPTION_INACTIVE, 'No active Flex subscription', 409);
    return subscription;
  }

  async createBooking(customerId: string, dto: CreateFlexBookingDto, key: string): Promise<unknown> {
    const fingerprint = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    try {
      const booking = await this.serial(async (tx) => {
        const prior = await tx.booking.findUnique({ where: { userId_idempotencyKey: { userId: customerId, idempotencyKey: key } } });
        if (prior) { if (prior.requestFingerprint !== fingerprint) this.fail(E.IDEMPOTENCY_KEY_CONFLICT, 'Idempotency key has different booking inputs'); return prior; }
        const sub = await tx.flexSubscription.findFirst({ where: { customerId, status: 'ACTIVE', expiresAt: { gt: new Date() } }, include: { periods: { where: { status: 'ACTIVE', endsAt: { gt: new Date() } }, take: 1 } } });
        if (!sub?.periods[0]) this.fail(E.FLEX_SUBSCRIPTION_INACTIVE, 'No active Flex period');
        await tx.$queryRaw`SELECT id FROM flex_subscriptions WHERE id = ${sub.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM slot_instances WHERE id = ${dto.slotId}::uuid FOR UPDATE`;
        const [plan, slot, participation] = await Promise.all([
          tx.gymPlan.findUnique({ where: { id: dto.planId }, include: { branches: true, gym: true } }),
          tx.slotInstance.findUnique({ where: { id: dto.slotId } }),
          tx.gymFlexParticipation.findUnique({ where: { branchId: dto.branchId }, include: { reimbursementRules: { where: { active: true, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, orderBy: { effectiveFrom: 'desc' }, take: 1 } } }),
        ]);
        if (!plan || !slot || slot.branchId !== dto.branchId || !plan.branches.some((b) => b.branchId === dto.branchId)) this.fail(E.FLEX_GYM_NOT_ELIGIBLE, 'Plan, slot, and branch do not match', 422);
        if (plan.gym.status !== GymStatus.APPROVED || !sub.eligiblePlanTypes.includes(plan.type) || slot.status !== SlotStatus.AVAILABLE || !participation?.enabled || !participation.allowedPlanTypes.includes(plan.type) || !participation.reimbursementRules[0]) this.fail(E.FLEX_GYM_NOT_ELIGIBLE, 'Branch or plan is not Flex eligible', 422);
        const cityRole = this.policy.cityRole(participation.serviceCityId, sub.primaryCityId, sub.secondaryCityId);
        const now = new Date(); const max = new Date(now.getTime() + sub.bookingAdvanceDays * 86_400_000);
        if (slot.startAt <= now || slot.startAt > max || slot.startAt >= sub.periods[0].endsAt) this.fail(E.BOOKING_WINDOW_CLOSED, 'Slot is outside the Flex booking window');
        const usageDate = new Date(Date.UTC(slot.startAt.getUTCFullYear(), slot.startAt.getUTCMonth(), slot.startAt.getUTCDate()));
        const [total, cityTotal, daily, usedCapacity] = await Promise.all([
          tx.flexUsage.count({ where: { periodId: sub.periods[0].id, status: { in: ACTIVE_USAGE } } }),
          tx.flexUsage.count({ where: { periodId: sub.periods[0].id, serviceCityId: participation.serviceCityId, status: { in: ACTIVE_USAGE } } }),
          tx.flexUsage.count({ where: { periodId: sub.periods[0].id, usageDate, status: { in: ACTIVE_USAGE } } }),
          tx.booking.count({ where: { slotId: slot.id, status: { in: ['CONFIRMED', 'CHECK_IN_AVAILABLE', 'CHECKED_IN'] } } }),
        ]);
        const cityLimit = cityRole === 'primary' ? sub.periods[0].primaryCityLimit : sub.periods[0].secondaryCityLimit;
        this.policy.assertAllowance({ total, totalLimit: sub.periods[0].totalLimit, cityTotal, cityLimit, daily, dailyLimit: sub.dailyUsageLimit });
        if (usedCapacity >= slot.capacity) this.fail(E.SLOT_FULL, 'Slot is full');
        const rule = participation.reimbursementRules[0];
        return tx.booking.create({ data: {
          userId: customerId, gymId: plan.gymId, branchId: dto.branchId, planId: plan.id, slotId: slot.id, status: 'CONFIRMED', source: 'FLEX', planName: plan.name, planType: plan.type, priceMinor: plan.priceMinor, customerChargeMinor: 0, currency: sub.currency,
          flexSubscriptionId: sub.id, flexUsagePeriodId: sub.periods[0].id, flexCityId: participation.serviceCityId, reimbursementMinor: rule.amountMinor, reimbursementCurrency: rule.currency, idempotencyKey: key, requestFingerprint: fingerprint,
          events: { create: { type: 'BOOKING_CREATED', fromStatus: 'CREATED', toStatus: 'CONFIRMED', actorUserId: customerId, metadata: { source: 'FLEX', subscriptionId: sub.id } } },
          flexUsage: { create: { subscriptionId: sub.id, periodId: sub.periods[0].id, customerId, gymId: plan.gymId, branchId: dto.branchId, serviceCityId: participation.serviceCityId, usageDate, reimbursementMinor: rule.amountMinor, reimbursementCurrency: rule.currency, reimbursementVersion: rule.version } },
        } });
      });
      await this.lifecycle.scheduleBooking(booking.id);
      return booking;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') this.fail(E.FLEX_USAGE_LIMIT_REACHED, 'Concurrent Flex booking changed availability; retry', 409);
      throw error;
    }
  }
  async cancelBooking(customerId: string, bookingId: string): Promise<unknown> {
    return this.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      const booking = await tx.booking.findFirst({ where: { id: bookingId, userId: customerId, source: 'FLEX' }, include: { flexUsage: true } });
      if (!booking) this.fail(E.BOOKING_NOT_FOUND, 'Flex booking not found', 404);
      if (booking.status !== 'CONFIRMED' || booking.flexUsage?.status !== 'RESERVED') this.fail(E.INVALID_BOOKING_TRANSITION, 'Only an upcoming reserved Flex booking can be cancelled');
      await tx.flexUsage.update({ where: { bookingId }, data: { status: 'RELEASED', releasedAt: new Date() } });
      return tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED', cancelledAt: new Date(), events: { create: { type: 'BOOKING_CANCELLED', fromStatus: 'CONFIRMED', toStatus: 'CANCELLED', actorUserId: customerId } } } });
    });
  }

  async partnerList(user: AuthUser, q: FlexListDto, resource: 'usage' | 'bookings' | 'earnings'): Promise<unknown> {
    if (q.branchId) await this.access.assertBranchManagement(user, q.branchId); else if (q.gymId) await this.access.assertGymManagement(user, q.gymId); else if (!this.access.isAdmin(user)) this.fail(E.FORBIDDEN, 'Select an authorized gym or branch', 403);
    const scope = { gymId: q.gymId, branchId: q.branchId };
    const skip = (q.page - 1) * q.limit;
    let data: unknown[];
    let total: number;
    if (resource === 'usage') [data, total] = await Promise.all([this.prisma.flexUsage.findMany({ where: scope, skip, take: q.limit, orderBy: { createdAt: 'desc' } }), this.prisma.flexUsage.count({ where: scope })]);
    else if (resource === 'bookings') [data, total] = await Promise.all([this.prisma.booking.findMany({ where: { ...scope, source: 'FLEX' }, skip, take: q.limit, orderBy: { createdAt: 'desc' } }), this.prisma.booking.count({ where: { ...scope, source: 'FLEX' } })]);
    else [data, total] = await Promise.all([this.prisma.gymEarning.findMany({ where: { ...scope, source: 'FLEX_USAGE' }, skip, take: q.limit, orderBy: { createdAt: 'desc' } }), this.prisma.gymEarning.count({ where: { ...scope, source: 'FLEX_USAGE' } })]);
    return { data, meta: pageMeta(q.page, q.limit, total) };
  }
  async partnerSummary(user: AuthUser, q: FlexListDto): Promise<unknown> {
    if (!q.gymId && !q.branchId) this.fail(E.FORBIDDEN, 'Select an authorized gym or branch', 403);
    if (q.branchId) await this.access.assertBranchManagement(user, q.branchId); else await this.access.assertGymManagement(user, q.gymId!);
    const where = { gymId: q.gymId, branchId: q.branchId };
    const [reserved, consumed, earnings] = await Promise.all([this.prisma.flexUsage.count({ where: { ...where, status: 'RESERVED' } }), this.prisma.flexUsage.count({ where: { ...where, status: 'CONSUMED' } }), this.prisma.gymEarning.aggregate({ where: { ...where, source: 'FLEX_USAGE' }, _sum: { netAmount: true } })]);
    return { reserved, consumed, reimbursementEarned: earnings._sum.netAmount ?? 0 };
  }
  async setParticipation(user: AuthUser, gymId: string, dto: ParticipationDto): Promise<unknown> {
    await this.access.assertGymManagement(user, gymId);
    const branch = await this.prisma.gymBranch.findFirst({ where: { id: dto.branchId, gymId } });
    if (!branch) this.fail(E.BRANCH_ACCESS_DENIED, 'Branch does not belong to gym', 403);
    const item = await this.prisma.gymFlexParticipation.upsert({ where: { branchId: dto.branchId }, create: { gymId, branchId: dto.branchId, serviceCityId: dto.serviceCityId, enabled: dto.enabled, allowedPlanTypes: dto.allowedPlanTypes, effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined, effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined }, update: { serviceCityId: dto.serviceCityId, enabled: dto.enabled, allowedPlanTypes: dto.allowedPlanTypes, effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null, effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null } });
    await this.prisma.auditLog.create({ data: { actorUserId: user.id, action: 'FLEX_PARTICIPATION_CHANGED', entityType: 'GymFlexParticipation', entityId: item.id } });
    return item;
  }
  async getParticipation(user: AuthUser, gymId: string): Promise<unknown> {
    await this.access.assertGymManagement(user, gymId);
    return this.prisma.gymFlexParticipation.findMany({ where: { gymId }, include: { branch: { select: { id: true, name: true, city: true } }, serviceCity: true, reimbursementRules: { where: { active: true }, orderBy: { effectiveFrom: 'desc' }, take: 1 } }, orderBy: { branch: { name: 'asc' } } });
  }
  async adminSummary(): Promise<unknown> {
    const [activeSubscriptions, reservedUsage, consumedUsage, revenue, reimbursements] = await Promise.all([this.prisma.flexSubscription.count({ where: { status: 'ACTIVE' } }), this.prisma.flexUsage.count({ where: { status: 'RESERVED' } }), this.prisma.flexUsage.count({ where: { status: 'CONSUMED' } }), this.prisma.flexPayment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }), this.prisma.gymEarning.aggregate({ where: { source: 'FLEX_USAGE' }, _sum: { netAmount: true } })]);
    return { activeSubscriptions, reservedUsage, consumedUsage, subscriptionRevenue: revenue._sum.amount ?? 0, gymReimbursements: reimbursements._sum.netAmount ?? 0 };
  }
  adminList(q: FlexListDto, resource: 'subscriptions' | 'usage' | 'participations'): Promise<unknown> {
    const skip = (q.page - 1) * q.limit;
    if (resource === 'subscriptions') {
      const where: Prisma.FlexSubscriptionWhereInput = { status: q.status as FlexSubscriptionStatus | undefined };
      return Promise.all([this.prisma.flexSubscription.findMany({ where, skip, take: q.limit, orderBy: { createdAt: 'desc' } }), this.prisma.flexSubscription.count({ where })]).then(([data, total]) => ({ data, meta: pageMeta(q.page, q.limit, total) }));
    }
    if (resource === 'usage') {
      const where: Prisma.FlexUsageWhereInput = { gymId: q.gymId, branchId: q.branchId, serviceCityId: q.cityId, status: q.status as FlexUsageStatus | undefined };
      return Promise.all([this.prisma.flexUsage.findMany({ where, skip, take: q.limit, orderBy: { createdAt: 'desc' } }), this.prisma.flexUsage.count({ where })]).then(([data, total]) => ({ data, meta: pageMeta(q.page, q.limit, total) }));
    }
    const where: Prisma.GymFlexParticipationWhereInput = { gymId: q.gymId, branchId: q.branchId, serviceCityId: q.cityId };
    return Promise.all([this.prisma.gymFlexParticipation.findMany({ where, skip, take: q.limit, orderBy: { createdAt: 'desc' } }), this.prisma.gymFlexParticipation.count({ where })]).then(([data, total]) => ({ data, meta: pageMeta(q.page, q.limit, total) }));
  }
  async createCity(actorId: string, dto: UpsertCityDto): Promise<unknown> { const item = await this.prisma.serviceCity.create({ data: { ...dto, code: dto.code.toLowerCase() } }); await this.audit(actorId, 'FLEX_PLAN_CHANGED', 'ServiceCity', item.id); return item; }
  async updateCity(actorId: string, id: string, dto: UpdateCityDto): Promise<unknown> { const item = await this.prisma.serviceCity.update({ where: { id }, data: { ...dto, code: dto.code?.toLowerCase() } }); await this.audit(actorId, 'FLEX_PLAN_CHANGED', 'ServiceCity', id); return item; }
  async createPlan(actorId: string, dto: CreateFlexPlanDto): Promise<unknown> { this.validateLimits(dto.totalUsageLimit, dto.primaryCityLimit, dto.secondaryCityLimit); const item = await this.prisma.flexPlan.create({ data: dto }); await this.audit(actorId, 'FLEX_PLAN_CHANGED', 'FlexPlan', item.id); return item; }
  async updatePlan(actorId: string, id: string, dto: UpdateFlexPlanDto): Promise<unknown> { const current = await this.prisma.flexPlan.findUnique({ where: { id } }); if (!current) this.fail(E.FLEX_PLAN_NOT_FOUND, 'Flex plan not found', 404); this.validateLimits(dto.totalUsageLimit ?? current.totalUsageLimit, dto.primaryCityLimit ?? current.primaryCityLimit, dto.secondaryCityLimit ?? current.secondaryCityLimit); const item = await this.prisma.flexPlan.update({ where: { id }, data: dto }); await this.audit(actorId, 'FLEX_PLAN_CHANGED', 'FlexPlan', id); return item; }
  async createRule(actorId: string, participationId: string, dto: ReimbursementDto): Promise<unknown> { const item = await this.prisma.flexReimbursementRule.create({ data: { participationId, amountMinor: dto.amountMinor, currency: dto.currency, version: dto.version, effectiveFrom: new Date(dto.effectiveFrom), effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined } }); await this.audit(actorId, 'FLEX_REIMBURSEMENT_CHANGED', 'FlexReimbursementRule', item.id); return item; }
  private validateLimits(total: number, primary: number, secondary: number): void { if (primary + secondary < total) this.fail(E.VALIDATION_FAILED, 'City limits must cover total usage limit', 400); }
  private async audit(actorId: string, action: 'FLEX_PLAN_CHANGED' | 'FLEX_REIMBURSEMENT_CHANGED', entityType: string, entityId: string): Promise<void> { await this.prisma.auditLog.create({ data: { actorUserId: actorId, action, entityType, entityId } }); }
}
