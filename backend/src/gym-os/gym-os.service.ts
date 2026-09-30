/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, GymOsPaymentStatus, GymOsPlanStatus, GymOsSubscriptionStatus, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { PaymentProvider } from '../finance/providers/payment-provider';
import { DevelopmentPaymentProvider } from '../finance/providers/development-payment.provider';
import { CreateGymOsPlanDto, GymOsListDto, UpdateGymOsPlanDto } from './gym-os.dto';
import { GymOsEntitlementService } from './gym-os-entitlement.service';
import { createNotificationIntent } from '../notifications/notification-intent';

const openStatuses = [GymOsSubscriptionStatus.TRIALING, GymOsSubscriptionStatus.PENDING_PAYMENT, GymOsSubscriptionStatus.ACTIVE, GymOsSubscriptionStatus.PAST_DUE] as const;

@Injectable()
export class GymOsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
    private readonly provider: PaymentProvider,
    private readonly entitlements: GymOsEntitlementService,
  ) {}

  plans(activeOnly = true) {
    return this.prisma.gymOsPlan.findMany({
      where: activeOnly ? { status: GymOsPlanStatus.ACTIVE } : undefined,
      include: { features: { select: { feature: true } } },
      orderBy: [{ displayOrder: 'asc' }, { priceMinor: 'asc' }],
    });
  }

  async subscription(user: AuthUser, gymId: string) {
    await this.access.assertGymManagement(user, gymId);
    await this.expireGym(gymId);
    const subscription = await this.prisma.gymOsSubscription.findFirst({ where: { gymId }, include: { plan: true, payment: true }, orderBy: { createdAt: 'desc' } });
    return { subscription, entitlements: await this.entitlements.getEffectiveEntitlements(gymId) };
  }

  async subscribe(user: AuthUser, gymId: string, planId: string, idempotencyKey: string) {
    const gymAccess = await this.access.assertGymOwnerOrAdmin(user, gymId);
    const existingKey = await this.prisma.gymOsSubscription.findUnique({ where: { idempotencyKey }, include: { payment: true } });
    if (existingKey) {
      if (existingKey.gymId !== gymId)
        this.fail(ApiErrorCode.GYMOS_SUBSCRIPTION_ALREADY_EXISTS, 'Idempotency key is already in use', HttpStatus.CONFLICT);
      return this.resumePurchase(existingKey);
    }
    const plan = await this.prisma.gymOsPlan.findUnique({ where: { id: planId }, include: { features: true } });
    if (!plan) this.fail(ApiErrorCode.GYMOS_PLAN_NOT_FOUND, 'GymOS plan not found', HttpStatus.NOT_FOUND);
    if (plan.status !== GymOsPlanStatus.ACTIVE) this.fail(ApiErrorCode.GYMOS_PLAN_INACTIVE, 'GymOS plan is not active', HttpStatus.CONFLICT);
    const open = await this.prisma.gymOsSubscription.findFirst({ where: { gymId, status: { in: [...openStatuses] } } });
    if (open) this.fail(ApiErrorCode.GYMOS_SUBSCRIPTION_ALREADY_EXISTS, 'This gym already has a current GymOS subscription', HttpStatus.CONFLICT);
    const priorTrial = plan.trialDays > 0
      ? await this.prisma.gymOsSubscription.findFirst({ where: { gymId, trialStart: { not: null } }, select: { id: true } })
      : null;
    const grantedTrialDays = priorTrial ? 0 : plan.trialDays;
    const now = new Date();
    const trialEnd = grantedTrialDays > 0 ? new Date(now.getTime() + grantedTrialDays * 86_400_000) : null;
    try {
      const subscription = await this.prisma.$transaction(async (tx) => {
        const value = await tx.gymOsSubscription.create({ data: {
          gymId, planId, status: trialEnd ? GymOsSubscriptionStatus.TRIALING : GymOsSubscriptionStatus.PENDING_PAYMENT,
          billingInterval: plan.billingInterval, trialStart: trialEnd ? now : null, trialEnd,
          provider: this.provider.name, idempotencyKey,
          planCodeSnapshot: plan.code, planNameSnapshot: plan.name, priceMinorSnapshot: plan.priceMinor,
          currencySnapshot: plan.currency, memberLimitSnapshot: plan.memberLimit, branchLimitSnapshot: plan.branchLimit,
          trialDaysSnapshot: grantedTrialDays, featuresSnapshot: plan.features.map((item) => item.feature),
        }});
        await tx.auditLog.create({ data: { actorUserId: user.id, action: AuditAction.GYMOS_SUBSCRIPTION_CREATED, entityType: 'GymOsSubscription', entityId: value.id, metadata: { gymId, planCode: plan.code } } });
        if (trialEnd) await createNotificationIntent(tx, {
          userId: gymAccess.ownerId,
          type: 'GYMOS_TRIAL_STARTED',
          category: 'GYMOS',
          title: 'Your GymOS trial has started',
          body: `${plan.name} is available until ${trialEnd.toLocaleDateString('en-IN')}.`,
          route: { screen: 'PartnerGymOs', gymId },
          dedupeKey: `gymos:${value.id}:trial-started`,
        });
        return value;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (trialEnd) return { subscription, checkout: null };
      const order = await this.provider.createPaymentOrder(`gymos_${subscription.id}`, plan.priceMinor, plan.currency);
      const payment = await this.prisma.gymOsPayment.create({ data: { subscriptionId: subscription.id, provider: this.provider.name, providerOrderId: order.id, amount: plan.priceMinor, currency: plan.currency, status: GymOsPaymentStatus.PENDING } });
      return { subscription, payment, checkout: { orderId: order.id, amount: order.amount, currency: order.currency, ...this.provider.checkoutConfiguration() } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') this.fail(ApiErrorCode.GYMOS_SUBSCRIPTION_ALREADY_EXISTS, 'A GymOS subscription request already exists', HttpStatus.CONFLICT);
      throw error;
    }
  }

  async verify(user: AuthUser, gymId: string, paymentId: string, orderId: string, providerPaymentId: string, signature: string) {
    await this.access.assertGymOwnerOrAdmin(user, gymId);
    const payment = await this.prisma.gymOsPayment.findFirst({ where: { id: paymentId, subscription: { gymId } }, include: { subscription: true } });
    if (!payment) this.fail(ApiErrorCode.GYMOS_SUBSCRIPTION_NOT_FOUND, 'GymOS payment not found', HttpStatus.NOT_FOUND);
    if (payment.status === GymOsPaymentStatus.SUCCESS) return payment.subscription;
    if (payment.providerOrderId !== orderId) this.fail(ApiErrorCode.GYMOS_PAYMENT_VERIFICATION_FAILED, 'Payment order does not match', HttpStatus.BAD_REQUEST);
    let verified;
    try { verified = await this.provider.verifyPayment(orderId, providerPaymentId, signature); }
    catch { this.fail(ApiErrorCode.GYMOS_PAYMENT_VERIFICATION_FAILED, 'Payment verification failed', HttpStatus.BAD_REQUEST); }
    if (verified.status !== 'captured' || verified.amount !== payment.amount || verified.currency !== payment.currency || verified.orderId !== orderId) this.fail(ApiErrorCode.GYMOS_PAYMENT_VERIFICATION_FAILED, 'Verified payment details do not match', HttpStatus.BAD_REQUEST);
    return this.prisma.$transaction(async (tx) => {
      await tx.gymOsPayment.update({ where: { id: payment.id }, data: { status: GymOsPaymentStatus.SUCCESS, providerPaymentId } });
      const subscription = await tx.gymOsSubscription.findUniqueOrThrow({ where: { id: payment.subscriptionId } });
      const gym = await tx.gym.findUniqueOrThrow({ where: { id: gymId }, select: { ownerId: true } });
      await createNotificationIntent(tx, { userId: gym.ownerId, type: 'PAYMENT_CONFIRMED', category: 'GYMOS', title: 'GymOS payment received', body: `${subscription.planNameSnapshot} is awaiting Admin activation.`, route: { screen: 'PartnerGymOs', gymId }, dedupeKey: `gymos:${subscription.id}:payment-confirmed` });
      return subscription;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async activateSubscription(actorId: string, id: string) {
    const current = await this.prisma.gymOsSubscription.findUnique({
      where: { id },
      include: { payment: true, gym: { select: { ownerId: true } } },
    });
    if (!current)
      this.fail(ApiErrorCode.GYMOS_SUBSCRIPTION_NOT_FOUND, 'GymOS subscription not found', HttpStatus.NOT_FOUND);
    if (current.status === GymOsSubscriptionStatus.ACTIVE) return current;
    if (current.status !== GymOsSubscriptionStatus.PENDING_PAYMENT && current.status !== GymOsSubscriptionStatus.TRIALING)
      this.fail(ApiErrorCode.GYMOS_SUBSCRIPTION_ALREADY_EXISTS, 'Only a pending payment or trial request can be activated', HttpStatus.CONFLICT);
    const paid = current.payment?.status === GymOsPaymentStatus.SUCCESS;
    const validTrial = current.status === GymOsSubscriptionStatus.TRIALING && !!current.trialEnd && current.trialEnd > new Date();
    if (!paid && !validTrial)
      this.fail(ApiErrorCode.GYMOS_PAYMENT_VERIFICATION_FAILED, 'Verified payment or a valid trial is required before activation', HttpStatus.CONFLICT);
    const start = new Date();
    const end = validTrial ? current.trialEnd : this.periodEnd(start, current.billingInterval);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.gymOsSubscription.updateMany({
        where: { id, status: current.status },
        data: { status: GymOsSubscriptionStatus.ACTIVE, activatedAt: start, currentPeriodStart: start, currentPeriodEnd: end },
      });
      if (changed.count !== 1)
        this.fail(ApiErrorCode.GYMOS_SUBSCRIPTION_ALREADY_EXISTS, 'GymOS subscription state changed; reload before activating', HttpStatus.CONFLICT);
      const subscription = await tx.gymOsSubscription.findUniqueOrThrow({ where: { id } });
      await createNotificationIntent(tx, { userId: current.gym.ownerId, type: 'GYMOS_SUBSCRIPTION_ACTIVATED', category: 'GYMOS', title: 'GymOS is active', body: `${subscription.planNameSnapshot} is ready for this gym.`, route: { screen: 'PartnerGymOs', gymId: subscription.gymId }, dedupeKey: `gymos:${subscription.id}:activated` });
      await tx.auditLog.create({ data: { actorUserId: actorId, action: AuditAction.GYMOS_SUBSCRIPTION_ACTIVATED, entityType: 'GymOsSubscription', entityId: subscription.id, metadata: { gymId: subscription.gymId, paymentStatus: current.payment?.status ?? null, trial: validTrial } } });
      return subscription;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async simulate(user: AuthUser, gymId: string, paymentId: string) {
    await this.access.assertGymOwnerOrAdmin(user, gymId);
    if (!(this.provider instanceof DevelopmentPaymentProvider)) this.fail(ApiErrorCode.GYMOS_PAYMENT_VERIFICATION_FAILED, 'Simulation is available only with the development provider', HttpStatus.NOT_FOUND);
    const payment = await this.prisma.gymOsPayment.findFirst({ where: { id: paymentId, subscription: { gymId } } });
    if (!payment?.providerOrderId) this.fail(ApiErrorCode.GYMOS_SUBSCRIPTION_NOT_FOUND, 'GymOS payment not found', HttpStatus.NOT_FOUND);
    return this.provider.simulate(payment.providerOrderId, payment.amount, payment.currency);
  }

  async cancel(user: AuthUser, gymId: string) {
    await this.access.assertGymOwnerOrAdmin(user, gymId);
    const current = await this.prisma.gymOsSubscription.findFirst({ where: { gymId, status: { in: [...openStatuses] } }, orderBy: { createdAt: 'desc' } });
    if (!current) this.fail(ApiErrorCode.GYMOS_SUBSCRIPTION_NOT_FOUND, 'Current GymOS subscription not found', HttpStatus.NOT_FOUND);
    const immediate = current.status === GymOsSubscriptionStatus.PENDING_PAYMENT || current.status === GymOsSubscriptionStatus.TRIALING;
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.gymOsSubscription.update({ where: { id: current.id }, data: immediate ? { status: GymOsSubscriptionStatus.CANCELLED, cancelledAt: new Date() } : { cancelAtPeriodEnd: true, cancelledAt: new Date() } });
      const gym = await tx.gym.findUniqueOrThrow({ where: { id: gymId }, select: { ownerId: true } });
      await createNotificationIntent(tx, { userId: gym.ownerId, type: 'GYMOS_SUBSCRIPTION_CANCELLED', category: 'GYMOS', title: 'GymOS cancellation recorded', body: immediate ? 'GymOS access has ended.' : 'GymOS remains available until the current period ends.', route: { screen: 'PartnerGymOs', gymId }, dedupeKey: `gymos:${value.id}:cancelled` });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: AuditAction.GYMOS_SUBSCRIPTION_CANCELLED, entityType: 'GymOsSubscription', entityId: value.id, metadata: { gymId, cancelAtPeriodEnd: !immediate } } });
      return value;
    });
  }

  async createPlan(actorId: string, dto: CreateGymOsPlanDto) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.gymOsPlan.create({ data: { ...dto, currency: dto.currency.toUpperCase(), features: { createMany: { data: [...new Set(dto.features)].map((feature) => ({ feature })) } } } });
      await tx.auditLog.create({ data: { actorUserId: actorId, action: AuditAction.GYMOS_PLAN_CHANGED, entityType: 'GymOsPlan', entityId: plan.id, metadata: { operation: 'created' } } });
      return plan;
    });
  }
  async updatePlan(actorId: string, id: string, dto: UpdateGymOsPlanDto) {
    const plan = await this.prisma.gymOsPlan.findUnique({ where: { id } });
    if (!plan) this.fail(ApiErrorCode.GYMOS_PLAN_NOT_FOUND, 'GymOS plan not found', HttpStatus.NOT_FOUND);
    if (plan.status !== GymOsPlanStatus.DRAFT && plan.status !== GymOsPlanStatus.INACTIVE) this.fail(ApiErrorCode.GYMOS_PLAN_INACTIVE, 'Only draft or inactive plans can be edited', HttpStatus.CONFLICT);
    const { features, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      if (features) { await tx.gymOsPlanFeature.deleteMany({ where: { planId: id } }); await tx.gymOsPlanFeature.createMany({ data: [...new Set(features)].map((feature) => ({ planId: id, feature })) }); }
      const value = await tx.gymOsPlan.update({ where: { id }, data });
      await tx.auditLog.create({ data: { actorUserId: actorId, action: AuditAction.GYMOS_PLAN_CHANGED, entityType: 'GymOsPlan', entityId: id, metadata: { operation: 'updated' } } });
      return value;
    });
  }
  async setPlanStatus(actorId: string, id: string, status: GymOsPlanStatus) {
    const value = await this.prisma.gymOsPlan.update({ where: { id }, data: { status, archivedAt: status === GymOsPlanStatus.ARCHIVED ? new Date() : null } }).catch(() => this.fail(ApiErrorCode.GYMOS_PLAN_NOT_FOUND, 'GymOS plan not found', HttpStatus.NOT_FOUND));
    await this.prisma.auditLog.create({ data: { actorUserId: actorId, action: AuditAction.GYMOS_PLAN_CHANGED, entityType: 'GymOsPlan', entityId: id, metadata: { status } } });
    return value;
  }
  adminSubscriptions(q: GymOsListDto) { return this.prisma.gymOsSubscription.findMany({ where: { status: q.status, planId: q.planId, gymId: q.gymId }, include: { gym: { select: { id: true, name: true, owner: { select: { phone: true, firstName: true, lastName: true } } } }, plan: true, payment: true }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  async adminSummary() { const rows = await this.prisma.gymOsSubscription.groupBy({ by: ['status'], _count: true }); return { total: rows.reduce((n, r) => n + r._count, 0), statuses: Object.fromEntries(rows.map((r) => [r.status, r._count])) }; }
  adminDetail(id: string) { return this.prisma.gymOsSubscription.findUnique({ where: { id }, include: { gym: { include: { owner: true } }, plan: { include: { features: true } }, payment: true } }); }
  async suspend(actorId: string, id: string, reason: string) { const value = await this.prisma.gymOsSubscription.update({ where: { id }, data: { status: GymOsSubscriptionStatus.SUSPENDED, suspendedAt: new Date(), suspensionReason: reason } }); await this.prisma.auditLog.create({ data: { actorUserId: actorId, action: AuditAction.GYMOS_SUBSCRIPTION_SUSPENDED, entityType: 'GymOsSubscription', entityId: id, metadata: { reason } } }); return value; }
  async reconcile() {
    const now = new Date();
    const candidates = await this.prisma.gymOsSubscription.findMany({
      where: {
        status: { in: [GymOsSubscriptionStatus.ACTIVE, GymOsSubscriptionStatus.TRIALING] },
        OR: [{ currentPeriodEnd: { lte: now } }, { trialEnd: { lte: now } }],
      },
    });
    let expired = 0;
    for (const item of candidates) if (await this.expireOne(item.id, now)) expired += 1;
    return { expired };
  }
  async sendExpiryReminders() {
    const now = new Date();
    const until = new Date(now.getTime() + 7 * 86_400_000);
    const subscriptions = await this.prisma.gymOsSubscription.findMany({
      where: {
        status: { in: [GymOsSubscriptionStatus.ACTIVE, GymOsSubscriptionStatus.TRIALING] },
        OR: [{ currentPeriodEnd: { gt: now, lte: until } }, { trialEnd: { gt: now, lte: until } }],
      },
      include: { gym: { select: { ownerId: true } } },
    });
    let reminded = 0;
    for (const item of subscriptions) {
      const end = item.trialEnd ?? item.currentPeriodEnd;
      if (!end) continue;
      const days = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
      if (![1, 3, 7].includes(days)) continue;
      const trial = item.status === GymOsSubscriptionStatus.TRIALING;
      await this.prisma.$transaction((tx) => createNotificationIntent(tx, {
        userId: item.gym.ownerId,
        type: trial ? 'GYMOS_TRIAL_EXPIRING' : 'GYMOS_SUBSCRIPTION_EXPIRING',
        category: 'GYMOS',
        title: trial ? 'Your GymOS trial is ending' : 'Your GymOS access is ending',
        body: `${item.planNameSnapshot} ends in ${days} day${days === 1 ? '' : 's'}.`,
        route: { screen: 'PartnerGymOs', gymId: item.gymId },
        dedupeKey: `gymos:${item.id}:${trial ? 'trial' : 'subscription'}-expiring:${days}`,
      }));
      reminded += 1;
    }
    return { reminded };
  }
  private async expireGym(gymId: string) {
    const now = new Date();
    const candidates = await this.prisma.gymOsSubscription.findMany({
      where: {
        gymId,
        status: { in: [GymOsSubscriptionStatus.ACTIVE, GymOsSubscriptionStatus.TRIALING] },
        OR: [{ currentPeriodEnd: { lte: now } }, { trialEnd: { lte: now } }],
      },
      select: { id: true },
    });
    for (const item of candidates) await this.expireOne(item.id, now);
  }
  private async expireOne(id: string, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.gymOsSubscription.findUnique({ where: { id }, include: { gym: { select: { ownerId: true } } } });
      if (!item || (item.status !== GymOsSubscriptionStatus.ACTIVE && item.status !== GymOsSubscriptionStatus.TRIALING)) return false;
      const target = item.cancelAtPeriodEnd ? GymOsSubscriptionStatus.CANCELLED : GymOsSubscriptionStatus.EXPIRED;
      const changed = await tx.gymOsSubscription.updateMany({ where: { id, status: item.status }, data: { status: target, expiredAt: now } });
      if (!changed.count) return false;
      await createNotificationIntent(tx, {
        userId: item.gym.ownerId,
        type: target === GymOsSubscriptionStatus.CANCELLED ? 'GYMOS_SUBSCRIPTION_CANCELLED' : 'GYMOS_SUBSCRIPTION_EXPIRED',
        category: 'GYMOS', title: target === GymOsSubscriptionStatus.CANCELLED ? 'GymOS access cancelled' : 'GymOS access expired',
        body: `${item.planNameSnapshot} access has ended.`, route: { screen: 'PartnerGymOs', gymId: item.gymId },
        dedupeKey: `gymos:${item.id}:${target.toLowerCase()}`,
      });
      await tx.auditLog.create({ data: { actorUserId: item.gym.ownerId, action: target === GymOsSubscriptionStatus.CANCELLED ? AuditAction.GYMOS_SUBSCRIPTION_CANCELLED : AuditAction.GYMOS_SUBSCRIPTION_EXPIRED, entityType: 'GymOsSubscription', entityId: item.id, metadata: { gymId: item.gymId, automated: true } } });
      return true;
    });
  }
  private async resumePurchase(value: { id: string; status: GymOsSubscriptionStatus; planNameSnapshot: string; priceMinorSnapshot: number; currencySnapshot: string; payment?: { id: string; providerOrderId: string | null; amount: number; currency: string } | null }) {
    if (value.status !== GymOsSubscriptionStatus.PENDING_PAYMENT)
      return { subscription: value, payment: value.payment ?? null, checkout: null, idempotent: true };
    let payment = value.payment;
    if (!payment) {
      const order = await this.provider.createPaymentOrder(`gymos_${value.id}`, value.priceMinorSnapshot, value.currencySnapshot);
      payment = await this.prisma.gymOsPayment.create({ data: { subscriptionId: value.id, provider: this.provider.name, providerOrderId: order.id, amount: value.priceMinorSnapshot, currency: value.currencySnapshot, status: GymOsPaymentStatus.PENDING } });
    }
    return { subscription: value, payment, checkout: { orderId: payment.providerOrderId, amount: payment.amount, currency: payment.currency, ...this.provider.checkoutConfiguration() }, idempotent: true };
  }
  private periodEnd(start: Date, interval: string) { const end = new Date(start); if (interval === 'YEARLY') end.setUTCFullYear(end.getUTCFullYear() + 1); else end.setUTCMonth(end.getUTCMonth() + 1); return end; }
  private fail(code: ApiErrorCode, message: string, status: HttpStatus): never { throw new DomainException(code, message, status); }
}
