/* eslint-disable @typescript-eslint/require-await */
import {
  GymOsAttendanceMethod,
  GymOsMemberPaymentMethod,
  GymOsFeature,
  GymOsMembershipDurationType,
  GymOsMembershipPlanStatus,
  GymOsMembershipStatus,
  RoleName,
  GymOsReminderType,
  GymOsReminderChannel,
  AuditAction,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../src/common/types/auth-user';
import { PrismaService } from '../src/database/prisma.service';
import { DevelopmentPaymentProvider } from '../src/finance/providers/development-payment.provider';
import { GymAccessService } from '../src/gym-access/gym-access.service';
import { GymOsEntitlementService } from '../src/gym-os/gym-os-entitlement.service';
import { GymOsService } from '../src/gym-os/gym-os.service';
import { GymOsMemberService } from '../src/gym-os/gym-os-member.service';
import { GymOsMembershipService } from '../src/gym-os/gym-os-membership.service';
import { GymOsAttendanceService } from '../src/gym-os/gym-os-attendance.service';
import { GymOsMemberFinanceService } from '../src/gym-os/gym-os-member-finance.service';
import { GymOsAnalyticsService } from '../src/gym-os/gym-os-analytics.service';
import { GymOsReminderService } from '../src/gym-os/gym-os-reminder.service';
import { DevelopmentGymOsMessagingProvider } from '../src/gym-os/providers/gym-os-messaging.provider';
import { GymOsReminderTimeService } from '../src/gym-os/gym-os-reminder-time.service';
import { GymOsAnalyticsRangeResolver } from '../src/gym-os/gym-os-analytics-range';
import { GymOsReminderCampaignService } from '../src/gym-os/gym-os-reminder-campaign.service';
import { GymOsAnalyticsRange } from '../src/gym-os/gym-os-analytics-range';
import { GymOsMessagingProvider } from '../src/gym-os/providers/gym-os-messaging.provider';

describe('PostgreSQL GymOS subscriptions (isolated test database)', () => {
  const url = process.env.FINANCE_TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/gymride_finance_test')
    throw new Error('Use test/run-finance-runtime.cjs');
  const prisma = new PrismaService({ datasourceUrl: url });
  const provider = new DevelopmentPaymentProvider('runtime-gymos-secret');
  const entitlements = new GymOsEntitlementService(prisma);
  const service = new GymOsService(prisma, new GymAccessService(prisma), provider, entitlements);
  const memberService = new GymOsMemberService(prisma, new GymAccessService(prisma), entitlements);
  const membershipService = new GymOsMembershipService(
    prisma,
    new GymAccessService(prisma),
    entitlements,
  );
  const attendanceService = new GymOsAttendanceService(
    prisma,
    new GymAccessService(prisma),
    entitlements,
    membershipService,
    new ConfigService({
      GYMOS_ATTENDANCE_QR_TTL_SECONDS: 60,
      GYMOS_ATTENDANCE_QR_RETENTION_HOURS: 24,
    }),
  );
  const memberFinanceService = new GymOsMemberFinanceService(
    prisma,
    new GymAccessService(prisma),
    entitlements,
  );
  const analyticsService = new GymOsAnalyticsService(
    prisma,
    new GymAccessService(prisma),
    entitlements,
    new GymOsAnalyticsRangeResolver(),
  );
  const reminderService = new GymOsReminderService(
    prisma,
    new GymAccessService(prisma),
    entitlements,
    new DevelopmentGymOsMessagingProvider(),
    new GymOsReminderTimeService(prisma),
  );
  const campaignService = new GymOsReminderCampaignService(
    prisma,
    new GymAccessService(prisma),
    entitlements,
    new GymOsReminderTimeService(prisma),
  );

  afterAll(async () => prisma.$disconnect());

  async function fixture(trialDays = 0, memberLimit = 500) {
    const owner = await prisma.user.create({
      data: { email: `${randomUUID()}@gymos.invalid`, status: 'ACTIVE' },
    });
    const gym = await prisma.gym.create({
      data: { name: 'GymOS runtime gym', ownerId: owner.id, status: 'APPROVED' },
    });
    const plan = await prisma.gymOsPlan.create({
      data: {
        code: `runtime-${randomUUID()}`,
        name: 'Runtime GymOS',
        description: 'Runtime validation plan',
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        priceMinor: 129900,
        currency: 'INR',
        trialDays,
        memberLimit,
        branchLimit: 3,
        features: {
          create: [
            { feature: GymOsFeature.MEMBERSHIP_MANAGEMENT },
            { feature: GymOsFeature.MEMBERS },
            { feature: GymOsFeature.ATTENDANCE },
            { feature: GymOsFeature.DUES },
            { feature: GymOsFeature.REPORTS },
            { feature: GymOsFeature.REMINDERS },
          ],
        },
      },
    });
    const user: AuthUser = {
      id: owner.id,
      sessionId: randomUUID(),
      roles: [RoleName.GYM_OWNER],
    };
    return { owner, gym, plan, user };
  }

  async function membershipFixture() {
    const context = await fixture(14);
    const request = (await service.subscribe(context.user, context.gym.id, context.plan.id, `gymos-${randomUUID()}`)) as { subscription: { id: string } };
    await service.activateSubscription(context.user.id, request.subscription.id);
    const member = (await memberService.create(context.user, context.gym.id, {
      firstName: 'Membership',
      lastName: 'Member',
      phone: `+91${String(Math.floor(Math.random() * 1_000_000_0000)).padStart(10, '7')}`,
    })) as { id: string };
    const membershipPlan = await membershipService.createPlan(context.user, context.gym.id, {
      code: `PLAN-${randomUUID()}`,
      name: 'Three month membership',
      durationType: GymOsMembershipDurationType.MONTHS,
      durationValue: 3,
      priceMinor: 300000,
      currency: 'INR',
    });
    await membershipService.planStatus(
      context.user,
      context.gym.id,
      membershipPlan.id,
      GymOsMembershipPlanStatus.ACTIVE,
    );
    return { ...context, member, membershipPlan };
  }

  async function attendanceFixture() {
    const context = await membershipFixture();
    const branch = await prisma.gymBranch.create({
      data: {
        gymId: context.gym.id,
        name: 'Attendance branch',
        address: '1 Attendance Street',
        city: 'Bhopal',
        state: 'MP',
        postalCode: '462001',
        country: 'IN',
        latitude: 23.2599,
        longitude: 77.4126,
        timezone: 'Asia/Kolkata',
        status: 'ACTIVE',
      },
    });
    const membership = await membershipService.assign(
      context.user,
      context.gym.id,
      context.member.id,
      {
        planId: context.membershipPlan.id,
        startDate: new Date().toISOString().slice(0, 10),
      },
    );
    return { ...context, branch, membership };
  }

  it('creates a server-priced payment and activates only after verification plus Admin approval', async () => {
    const { gym, plan, user } = await fixture();
    const purchase = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as {
      payment: { id: string };
      checkout: { orderId: string; amount: number };
    };
    expect(purchase.checkout.amount).toBe(129900);
    const receipt = await service.simulate(user, gym.id, purchase.payment.id);
    const awaitingActivation = await service.verify(
      user,
      gym.id,
      purchase.payment.id,
      purchase.checkout.orderId,
      receipt.paymentId,
      receipt.signature,
    );
    expect(awaitingActivation.status).toBe('PENDING_PAYMENT');
    expect((await entitlements.getEffectiveEntitlements(gym.id)).subscribed).toBe(false);
    const active = await service.activateSubscription(user.id, awaitingActivation.id);
    expect(active.status).toBe('ACTIVE');
    expect((await entitlements.getEffectiveEntitlements(gym.id)).subscribed).toBe(true);
  });

  it('reuses the same idempotency key without creating another subscription', async () => {
    const { gym, plan, user } = await fixture();
    const key = `gymos-${randomUUID()}`;
    const first = await service.subscribe(user, gym.id, plan.id, key);
    const second = await service.subscribe(user, gym.id, plan.id, key);
    expect((second as { subscription: { id: string } }).subscription.id).toBe(
      (first as { subscription: { id: string } }).subscription.id,
    );
    expect(await prisma.gymOsSubscription.count({ where: { gymId: gym.id } })).toBe(1);
  });

  it('allows exactly one logical subscription during concurrent creation', async () => {
    const { gym, plan, user } = await fixture();
    const outcomes = await Promise.allSettled([
      service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`),
      service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.gymOsSubscription.count({ where: { gymId: gym.id } })).toBe(1);
  });

  it('snapshots plan limits and features so later plan edits do not alter access', async () => {
    const { gym, plan, user } = await fixture(14);
    const request = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as { subscription: { id: string } };
    await service.activateSubscription(user.id, request.subscription.id);
    await prisma.gymOsPlan.update({
      where: { id: plan.id },
      data: { memberLimit: 1, branchLimit: 1 },
    });
    const result = await entitlements.getEffectiveEntitlements(gym.id);
    expect(result.limits).toEqual({ members: 500, branches: 3 });
    expect(result.features).toContain(GymOsFeature.MEMBERSHIP_MANAGEMENT);
  });

  it('grants a gym trial once and sends a later purchase through payment', async () => {
    const { gym, plan, user } = await fixture(14);
    const first = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as {
      checkout: null;
    };
    expect(first.checkout).toBeNull();
    await service.cancel(user, gym.id);
    const second = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as {
      checkout: { amount: number };
      subscription: { trialDaysSnapshot: number };
    };
    expect(second.checkout.amount).toBe(129900);
    expect(second.subscription.trialDaysSnapshot).toBe(0);
  });

  it('denies entitlements immediately after the authoritative period ends', async () => {
    const { gym, plan, user } = await fixture(14);
    const result = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as {
      subscription: { id: string };
    };
    await prisma.gymOsSubscription.update({
      where: { id: result.subscription.id },
      data: { trialEnd: new Date(Date.now() - 1_000) },
    });
    await expect(
      entitlements.assertFeature(gym.id, GymOsFeature.MEMBERSHIP_MANAGEMENT),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_SUBSCRIPTION_INACTIVE' } });
  });

  it('allows exactly one concurrent member creation for one remaining plan slot', async () => {
    const { gym, plan, user } = await fixture(14, 1);
    const request = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as { subscription: { id: string } };
    await service.activateSubscription(user.id, request.subscription.id);
    const outcomes = await Promise.allSettled([
      memberService.create(user, gym.id, { firstName: 'One', phone: '+919000000001' }),
      memberService.create(user, gym.id, { firstName: 'Two', phone: '+919000000002' }),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.gymMember.count({ where: { gymId: gym.id, status: 'ACTIVE' } })).toBe(1);
  });

  it('creates one member when normalized duplicate phones race', async () => {
    const { gym, plan, user } = await fixture(14);
    const request = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as { subscription: { id: string } };
    await service.activateSubscription(user.id, request.subscription.id);
    const outcomes = await Promise.allSettled([
      memberService.create(user, gym.id, { firstName: 'First', phone: '+919000000003' }),
      memberService.create(user, gym.id, { firstName: 'Second', phone: '+91 90000 00003' }),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.gymMember.count({ where: { gymId: gym.id } })).toBe(1);
  });

  it('previews without mutation then atomically imports valid CSV members', async () => {
    const { gym, plan, user } = await fixture(14);
    const request = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as { subscription: { id: string } };
    await service.activateSubscription(user.id, request.subscription.id);
    const csv =
      'firstName,lastName,phone,email\nRahul,Sharma,+919000000004,rahul@example.com\nAnita,Joshi,+919000000005,anita@example.com';
    await expect(memberService.previewImport(user, gym.id, { csv })).resolves.toMatchObject({
      validRows: 2,
      importedRows: 0,
    });
    expect(await prisma.gymMember.count({ where: { gymId: gym.id } })).toBe(0);
    await expect(memberService.importMembers(user, gym.id, { csv })).resolves.toMatchObject({
      importedRows: 2,
      failedRows: 0,
    });
    expect(await prisma.gymMember.count({ where: { gymId: gym.id } })).toBe(2);
  });

  it('blocks cross-gym IDOR and keeps staff member access read-only', async () => {
    const { gym, plan, user } = await fixture(14);
    const request = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as { subscription: { id: string } };
    await service.activateSubscription(user.id, request.subscription.id);
    const member = (await memberService.create(user, gym.id, {
      firstName: 'Scoped',
      phone: '+919000000006',
    })) as { id: string };
    const outsider = await prisma.user.create({
      data: { email: `${randomUUID()}@gymos.invalid`, status: 'ACTIVE' },
    });
    const outsiderAuth: AuthUser = {
      id: outsider.id,
      sessionId: randomUUID(),
      roles: [RoleName.GYM_OWNER],
    };
    await expect(memberService.detail(outsiderAuth, gym.id, member.id)).rejects.toBeDefined();
    const staff = await prisma.user.create({
      data: { email: `${randomUUID()}@gymos.invalid`, status: 'ACTIVE' },
    });
    await prisma.gymMembership.create({ data: { userId: staff.id, gymId: gym.id, role: 'STAFF' } });
    const staffAuth: AuthUser = {
      id: staff.id,
      sessionId: randomUUID(),
      roles: [RoleName.GYM_STAFF],
    };
    await expect(memberService.detail(staffAuth, gym.id, member.id)).resolves.toMatchObject({
      id: member.id,
    });
    await expect(
      memberService.update(staffAuth, gym.id, member.id, { firstName: 'Denied' }),
    ).rejects.toBeDefined();
  });

  it('supports edit, deactivate, capacity-checked reactivate, archive and summaries', async () => {
    const { gym, plan, user } = await fixture(14, 2);
    const request = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as { subscription: { id: string } };
    await service.activateSubscription(user.id, request.subscription.id);
    const member = (await memberService.create(user, gym.id, {
      firstName: 'Lifecycle',
      phone: '+919000000007',
    })) as { id: string };
    await expect(
      memberService.update(user, gym.id, member.id, { email: 'MEMBER@EXAMPLE.COM' }),
    ).resolves.toMatchObject({ email: 'member@example.com' });
    await memberService.transition(user, gym.id, member.id, 'INACTIVE');
    await expect(memberService.summary(user, gym.id)).resolves.toMatchObject({
      active: 0,
      inactive: 1,
      memberLimit: 2,
    });
    await memberService.transition(user, gym.id, member.id, 'ACTIVE');
    await memberService.transition(user, gym.id, member.id, 'ARCHIVED');
    await expect(
      memberService.update(user, gym.id, member.id, { firstName: 'Nope' }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_MEMBER_ARCHIVED' } });
  });

  it('reports CSV header, phone, email, branch, duplicate and plan-limit errors without mutation', async () => {
    const { gym, plan, user } = await fixture(14, 1);
    const request = (await service.subscribe(user, gym.id, plan.id, `gymos-${randomUUID()}`)) as { subscription: { id: string } };
    await service.activateSubscription(user.id, request.subscription.id);
    await expect(
      memberService.previewImport(user, gym.id, { csv: 'name,phone\nA,+919000000008' }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_MEMBER_IMPORT_INVALID' } });
    const unknownBranch = randomUUID();
    const csv = `firstName,phone,email,primaryBranchId\nBad phone,123,bad,${unknownBranch}\nBad email,+919000000008,bad,\nBad branch,+919000000009,good@example.com,${unknownBranch}\nDuplicate,+919000000010,good@example.com,\nDuplicate two,+91 90000 00010,other@example.com,`;
    const preview = await memberService.previewImport(user, gym.id, { csv });
    expect(preview.failedRows).toBe(4);
    expect(preview.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'GYMOS_MEMBER_PHONE_INVALID',
        'INVALID_EMAIL',
        'GYMOS_MEMBER_BRANCH_INVALID',
        'GYMOS_MEMBER_ALREADY_EXISTS',
      ]),
    );
    expect(await prisma.gymMember.count({ where: { gymId: gym.id } })).toBe(0);
    await memberService.create(user, gym.id, { firstName: 'Full', phone: '+919000000011' });
    await expect(
      memberService.previewImport(user, gym.id, { csv: 'firstName,phone\nOver,+919000000012' }),
    ).resolves.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'GYMOS_MEMBER_IMPORT_LIMIT_EXCEEDED' }),
      ]),
    });
  });

  it('assigns a server-derived membership snapshot and preserves it after plan edits', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const membership = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: '2026-10-01',
    });
    expect(membership).toMatchObject({
      status: GymOsMembershipStatus.SCHEDULED,
      planNameSnapshot: 'Three month membership',
      priceMinorSnapshot: 300000,
    });
    expect(membership.endDate.toISOString().slice(0, 10)).toBe('2026-12-31');
    await membershipService.updatePlan(user, gym.id, membershipPlan.id, {
      name: 'Changed plan name',
      priceMinor: 999,
    });
    await expect(
      prisma.gymOsMembership.findUnique({ where: { id: membership.id } }),
    ).resolves.toMatchObject({
      planNameSnapshot: 'Three month membership',
      priceMinorSnapshot: 300000,
    });
  });

  it('rejects duplicate plan codes and assignment from inactive plans', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    await expect(
      membershipService.createPlan(user, gym.id, {
        code: membershipPlan.code,
        name: 'Duplicate code',
        durationType: GymOsMembershipDurationType.DAYS,
        durationValue: 30,
        priceMinor: 10000,
        currency: 'INR',
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_MEMBERSHIP_PLAN_CODE_EXISTS' } });
    await membershipService.planStatus(
      user,
      gym.id,
      membershipPlan.id,
      GymOsMembershipPlanStatus.INACTIVE,
    );
    await expect(
      membershipService.assign(user, gym.id, member.id, {
        planId: membershipPlan.id,
        startDate: new Date().toISOString().slice(0, 10),
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_MEMBERSHIP_PLAN_INACTIVE' } });
  });

  it('allows only one concurrent overlapping membership assignment', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const requests = await Promise.allSettled([
      membershipService.assign(user, gym.id, member.id, {
        planId: membershipPlan.id,
        startDate: '2026-10-01',
      }),
      membershipService.assign(user, gym.id, member.id, {
        planId: membershipPlan.id,
        startDate: '2026-10-01',
      }),
    ]);
    expect(requests.filter((request) => request.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.gymOsMembership.count({ where: { memberId: member.id } })).toBe(1);
  });

  it('freezes once and resumes by extending the membership period once', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const membership = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: '2026-01-01',
    });
    const freezes = await Promise.allSettled([
      membershipService.freeze(user, gym.id, membership.id, 'Medical pause'),
      membershipService.freeze(user, gym.id, membership.id, 'Duplicate'),
    ]);
    expect(freezes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    await prisma.gymOsMembership.update({
      where: { id: membership.id },
      data: { freezeStartedAt: new Date(Date.now() - 2 * 86_400_000) },
    });
    const resumes = await Promise.allSettled([
      membershipService.resume(user, gym.id, membership.id),
      membershipService.resume(user, gym.id, membership.id),
    ]);
    expect(resumes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const resumed = await prisma.gymOsMembership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(resumed.status).toBe(GymOsMembershipStatus.ACTIVE);
    expect(resumed.totalFrozenDays).toBe(2);
    await expect(membershipService.resume(user, gym.id, membership.id)).rejects.toMatchObject({
      response: { code: 'GYMOS_MEMBERSHIP_NOT_FROZEN' },
    });
  });

  it('creates exactly one linked renewal during concurrent renewal requests', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const membership = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: '2026-01-01',
    });
    const outcomes = await Promise.allSettled([
      membershipService.renew(user, gym.id, membership.id, { planId: membershipPlan.id }),
      membershipService.renew(user, gym.id, membership.id, { planId: membershipPlan.id }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.gymOsMembership.count({
        where: { renewedFromMembershipId: membership.id },
      }),
    ).toBe(1);
  });

  it('reconciles expiry before renewal activation and is idempotent', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const oldMembership = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: '2025-01-01',
    });
    const renewal = await membershipService.renew(user, gym.id, oldMembership.id, {
      planId: membershipPlan.id,
      startDate: new Date().toISOString().slice(0, 10),
    });
    await prisma.$transaction([
      prisma.gymOsMembership.update({
        where: { id: renewal.id },
        data: { status: GymOsMembershipStatus.SCHEDULED },
      }),
      prisma.gymOsMembership.update({
        where: { id: oldMembership.id },
        data: { status: GymOsMembershipStatus.ACTIVE, expiredAt: null },
      }),
    ]);
    const reconciliations = await Promise.all([
      membershipService.reconcile(gym.id),
      membershipService.reconcile(gym.id),
    ]);
    expect(reconciliations.reduce((sum, item) => sum + item.activated, 0)).toBe(1);
    expect(reconciliations.reduce((sum, item) => sum + item.expired, 0)).toBe(1);
    await expect(membershipService.reconcile(gym.id)).resolves.toEqual({
      activated: 0,
      expired: 0,
    });
    expect(
      await prisma.gymOsMembership.count({ where: { memberId: member.id, status: 'ACTIVE' } }),
    ).toBe(1);
  });

  it('returns exact expiry buckets and lifecycle status totals', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const membership = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: new Date().toISOString().slice(0, 10),
    });
    await prisma.gymOsMembership.update({
      where: { id: membership.id },
      data: {
        endDate: new Date(
          `${new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date())}T00:00:00.000Z`,
        ),
      },
    });
    await expect(membershipService.expirySummary(user, gym.id)).resolves.toMatchObject({
      today: 1,
      statuses: { ACTIVE: 1 },
    });
  });

  it('enforces membership IDOR and staff read-only access', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const membership = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: new Date().toISOString().slice(0, 10),
    });
    const outsiderFixture = await membershipFixture();
    await expect(
      membershipService.freeze(
        outsiderFixture.user,
        outsiderFixture.gym.id,
        membership.id,
        'Cross gym',
      ),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_MEMBERSHIP_NOT_FOUND' } });
    const staff = await prisma.user.create({
      data: { email: `${randomUUID()}@gymos.invalid`, status: 'ACTIVE' },
    });
    await prisma.gymMembership.create({
      data: { userId: staff.id, gymId: gym.id, role: 'STAFF' },
    });
    const staffUser: AuthUser = {
      id: staff.id,
      sessionId: randomUUID(),
      roles: [RoleName.GYM_STAFF],
    };
    await expect(
      membershipService.memberHistory(staffUser, gym.id, member.id),
    ).resolves.toHaveLength(1);
    await expect(
      membershipService.freeze(staffUser, gym.id, membership.id, 'Not allowed'),
    ).rejects.toBeDefined();
  });

  it('uses calendar-month arithmetic at month boundaries and gym-local expiry dates', async () => {
    const { gym, user, member } = await membershipFixture();
    const branch = await prisma.gymBranch.create({
      data: {
        gymId: gym.id,
        name: 'New York branch',
        address: '1 Test Street',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
        latitude: 40.7128,
        longitude: -74.006,
        timezone: 'America/New_York',
        status: 'ACTIVE',
      },
    });
    const plan = await membershipService.createPlan(user, gym.id, {
      code: `MONTH-END-${randomUUID()}`,
      name: 'Month end plan',
      durationType: GymOsMembershipDurationType.MONTHS,
      durationValue: 1,
      priceMinor: 10000,
      currency: 'INR',
      branchIds: [branch.id],
    });
    await membershipService.planStatus(user, gym.id, plan.id, GymOsMembershipPlanStatus.ACTIVE);
    const membership = await membershipService.assign(user, gym.id, member.id, {
      planId: plan.id,
      startDate: '2027-01-31',
    });
    expect(membership.endDate.toISOString().slice(0, 10)).toBe('2027-02-27');
    expect(membership.branchIdsSnapshot).toEqual([branch.id]);
    const yearBoundaryMember = (await memberService.create(user, gym.id, {
      firstName: 'Year Boundary',
      phone: `+91${String(Math.floor(Math.random() * 1_000_000_0000)).padStart(10, '6')}`,
    })) as { id: string };
    const yearBoundaryMembership = await membershipService.assign(
      user,
      gym.id,
      yearBoundaryMember.id,
      { planId: plan.id, startDate: '2027-12-15' },
    );
    expect(yearBoundaryMembership.endDate.toISOString().slice(0, 10)).toBe('2028-01-14');
  });

  it('checks in and checks out an eligible member with immutable audit history', async () => {
    const { gym, user, member, branch } = await attendanceFixture();
    const attendance = await attendanceService.checkIn(user, gym.id, {
      memberId: member.id,
      branchId: branch.id,
      reason: 'Front desk',
    });
    expect(attendance).toMatchObject({
      memberId: member.id,
      branchId: branch.id,
      status: 'CHECKED_IN',
      checkInMethod: GymOsAttendanceMethod.MANUAL,
    });
    const checkedOut = await attendanceService.checkOut(user, gym.id, attendance.id);
    expect(checkedOut).toMatchObject({ status: 'CHECKED_OUT' });
    expect(checkedOut.checkOutAt).toBeInstanceOf(Date);
    expect(await prisma.auditLog.count({ where: { entityId: attendance.id } })).toBe(2);
  });

  it('allows exactly one concurrent open check-in and one concurrent checkout', async () => {
    const { gym, user, member, branch } = await attendanceFixture();
    const checkIns = await Promise.allSettled([
      attendanceService.checkIn(user, gym.id, { memberId: member.id, branchId: branch.id }),
      attendanceService.checkIn(user, gym.id, { memberId: member.id, branchId: branch.id }),
    ]);
    expect(checkIns.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.gymOsAttendance.count({ where: { memberId: member.id, checkOutAt: null } }),
    ).toBe(1);
    const attendance = await prisma.gymOsAttendance.findFirstOrThrow({
      where: { memberId: member.id, checkOutAt: null },
    });
    const checkOuts = await Promise.allSettled([
      attendanceService.checkOut(user, gym.id, attendance.id),
      attendanceService.checkOut(user, gym.id, attendance.id),
    ]);
    expect(checkOuts.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  });

  it('rejects frozen, expired and branch-ineligible memberships', async () => {
    const frozen = await attendanceFixture();
    await membershipService.freeze(frozen.user, frozen.gym.id, frozen.membership.id, 'Pause');
    await expect(
      attendanceService.checkIn(frozen.user, frozen.gym.id, {
        memberId: frozen.member.id,
        branchId: frozen.branch.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_ATTENDANCE_MEMBERSHIP_FROZEN' } });

    const expired = await attendanceFixture();
    await prisma.gymOsMembership.update({
      where: { id: expired.membership.id },
      data: {
        startDate: new Date('2019-01-01'),
        endDate: new Date('2020-01-01'),
        status: 'ACTIVE',
      },
    });
    await expect(
      attendanceService.checkIn(expired.user, expired.gym.id, {
        memberId: expired.member.id,
        branchId: expired.branch.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_ATTENDANCE_MEMBERSHIP_REQUIRED' } });

    const scoped = await attendanceFixture();
    const secondBranch = await prisma.gymBranch.create({
      data: {
        gymId: scoped.gym.id,
        name: 'Not entitled branch',
        address: '2 Attendance Street',
        city: 'Bhopal',
        state: 'MP',
        postalCode: '462001',
        country: 'IN',
        latitude: 23.25,
        longitude: 77.41,
        timezone: 'Asia/Kolkata',
        status: 'ACTIVE',
      },
    });
    await prisma.gymOsMembership.update({
      where: { id: scoped.membership.id },
      data: { branchIdsSnapshot: [scoped.branch.id] },
    });
    await expect(
      attendanceService.checkIn(scoped.user, scoped.gym.id, {
        memberId: scoped.member.id,
        branchId: secondBranch.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_ATTENDANCE_BRANCH_NOT_ALLOWED' } });
  });

  it('validates rotating QR tokens and permits reuse only for distinct eligible members', async () => {
    const context = await attendanceFixture();
    const token = await attendanceService.qrToken(context.user, context.gym.id, context.branch.id);
    await attendanceService.qrCheckIn(context.user, context.gym.id, {
      memberId: context.member.id,
      branchId: context.branch.id,
      token: token.token,
    });
    await expect(
      attendanceService.qrCheckIn(context.user, context.gym.id, {
        memberId: context.member.id,
        branchId: context.branch.id,
        token: token.token,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_ATTENDANCE_ALREADY_CHECKED_IN' } });
    await expect(
      attendanceService.qrCheckIn(context.user, context.gym.id, {
        memberId: context.member.id,
        branchId: context.branch.id,
        token: `${token.token}tampered`,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_ATTENDANCE_QR_INVALID' } });
    const secondMember = (await memberService.create(context.user, context.gym.id, {
      firstName: 'Second QR',
      phone: '+919000009991',
    })) as { id: string };
    await membershipService.assign(context.user, context.gym.id, secondMember.id, {
      planId: context.membershipPlan.id,
      startDate: new Date().toISOString().slice(0, 10),
    });
    await expect(
      attendanceService.qrCheckIn(context.user, context.gym.id, {
        memberId: secondMember.id,
        branchId: context.branch.id,
        token: token.token,
      }),
    ).resolves.toMatchObject({ checkInMethod: 'QR' });
    expect(await prisma.gymOsAttendanceQrToken.findFirst()).toMatchObject({
      tokenHash: expect.any(String),
    });
    expect(JSON.stringify(await prisma.gymOsAttendanceQrToken.findFirst())).not.toContain(
      token.token.split('.')[1],
    );
  });

  it('rejects expired and revoked QR tokens with stable errors', async () => {
    const context = await attendanceFixture();
    const expired = await attendanceService.qrToken(
      context.user,
      context.gym.id,
      context.branch.id,
    );
    await prisma.gymOsAttendanceQrToken.update({
      where: { id: expired.token.split('.')[0] },
      data: {
        createdAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await expect(
      attendanceService.qrCheckIn(context.user, context.gym.id, {
        memberId: context.member.id,
        branchId: context.branch.id,
        token: expired.token,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_ATTENDANCE_QR_EXPIRED' } });
    const revoked = await attendanceService.qrToken(
      context.user,
      context.gym.id,
      context.branch.id,
    );
    await prisma.gymOsAttendanceQrToken.update({
      where: { id: revoked.token.split('.')[0] },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await expect(
      attendanceService.qrCheckIn(context.user, context.gym.id, {
        memberId: context.member.id,
        branchId: context.branch.id,
        token: revoked.token,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_ATTENDANCE_QR_REVOKED' } });
  });

  it('reports present and gym-local attendance summaries without cross-gym leakage', async () => {
    const context = await attendanceFixture();
    await attendanceService.checkIn(context.user, context.gym.id, {
      memberId: context.member.id,
      branchId: context.branch.id,
    });
    await expect(
      attendanceService.summary(context.user, context.gym.id, context.branch.id),
    ).resolves.toMatchObject({
      todayCheckIns: 1,
      currentlyPresent: 1,
      uniqueMembersToday: 1,
      last7DaysCount: 1,
      last30DaysCount: 1,
    });
    const outsider = await attendanceFixture();
    await expect(
      attendanceService.memberHistory(outsider.user, outsider.gym.id, context.member.id, {
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_ATTENDANCE_MEMBER_NOT_FOUND' } });
  });

  it('uses branch-local midnight and preserves cross-midnight visit duration', async () => {
    const midnight = DateTime.now().setZone('America/New_York').startOf('day');
    const context = await attendanceFixture();
    await prisma.gymBranch.update({
      where: { id: context.branch.id },
      data: { timezone: 'America/New_York' },
    });
    await prisma.gymOsMembership.update({
      where: { id: context.membership.id },
      data: { startDate: new Date(`${midnight.toISODate()}T00:00:00.000Z`) },
    });
    const attendance = await attendanceService.checkIn(context.user, context.gym.id, {
      memberId: context.member.id,
      branchId: context.branch.id,
    });
    await prisma.gymOsAttendance.update({
      where: { id: attendance.id },
      data: {
        checkInAt: midnight.minus({ minutes: 10 }).toUTC().toJSDate(),
        checkOutAt: midnight.plus({ minutes: 20 }).toUTC().toJSDate(),
        status: 'CHECKED_OUT',
        checkOutMethod: 'MANUAL',
      },
    });
    const summary = await attendanceService.summary(
      context.user,
      context.gym.id,
      context.branch.id,
    );
    expect(summary).toMatchObject({ todayCheckIns: 0, checkOutsToday: 1 });
    const history = await attendanceService.memberHistory(
      context.user,
      context.gym.id,
      context.member.id,
      { page: 1, pageSize: 25 },
    );
    expect(history.data[0]?.durationMinutes).toBe(30);
  });

  it('creates an immutable charge from membership and preserves its price snapshot', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const membership = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: new Date().toISOString().slice(0, 10),
    });
    await membershipService.updatePlan(user, gym.id, membershipPlan.id, { priceMinor: 900000 });
    await expect(
      prisma.gymOsMemberCharge.findUnique({ where: { membershipId: membership.id } }),
    ).resolves.toMatchObject({ amountMinor: 300000, currency: 'INR', status: 'UNPAID' });
  });

  it('records partial payments, creates receipts and rejects overpayment', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const membership = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: new Date().toISOString().slice(0, 10),
    });
    const charge = await prisma.gymOsMemberCharge.findUniqueOrThrow({
      where: { membershipId: membership.id },
    });
    const first = await memberFinanceService.record(user, gym.id, `pay-${randomUUID()}`, {
      chargeId: charge.id,
      amountMinor: 150000,
      method: GymOsMemberPaymentMethod.UPI,
      reference: 'UTR-123',
    });
    expect(first).toMatchObject({
      remainingDueMinor: 150000,
      receipt: { receiptNumber: expect.stringMatching(/^GR-\d{4}-\d{6}$/) },
    });
    await memberFinanceService.record(user, gym.id, `pay-${randomUUID()}`, {
      chargeId: charge.id,
      amountMinor: 100000,
      method: GymOsMemberPaymentMethod.CASH,
    });
    await expect(
      memberFinanceService.record(user, gym.id, `pay-${randomUUID()}`, {
        chargeId: charge.id,
        amountMinor: 50001,
        method: GymOsMemberPaymentMethod.CARD,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_PAYMENT_EXCEEDS_OUTSTANDING' } });
    await memberFinanceService.record(user, gym.id, `pay-${randomUUID()}`, {
      chargeId: charge.id,
      amountMinor: 50000,
      method: GymOsMemberPaymentMethod.BANK_TRANSFER,
    });
    await expect(
      prisma.gymOsMemberCharge.findUnique({ where: { id: charge.id } }),
    ).resolves.toMatchObject({ status: 'PAID' });
  });

  it('makes payment idempotency payload-aware and reverses only once', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const membership = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: new Date().toISOString().slice(0, 10),
    });
    const charge = await prisma.gymOsMemberCharge.findUniqueOrThrow({
      where: { membershipId: membership.id },
    });
    const key = `pay-${randomUUID()}`,
      dto = { chargeId: charge.id, amountMinor: 100000, method: GymOsMemberPaymentMethod.CASH };
    const first = await memberFinanceService.record(user, gym.id, key, dto),
      repeated = await memberFinanceService.record(user, gym.id, key, dto);
    expect(repeated.id).toBe(first.id);
    await expect(
      memberFinanceService.record(user, gym.id, key, { ...dto, amountMinor: 200000 }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_PAYMENT_IDEMPOTENCY_CONFLICT' } });
    await memberFinanceService.reverse(user, gym.id, first.id, 'Incorrect entry');
    await expect(
      memberFinanceService.reverse(user, gym.id, first.id, 'Again'),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_PAYMENT_ALREADY_REVERSED' } });
    await expect(
      prisma.gymOsMemberCharge.findUnique({ where: { id: charge.id } }),
    ).resolves.toMatchObject({ status: 'UNPAID' });
  });

  it('serializes competing full payments while allowing safe concurrent partial payments', async () => {
    const context = await membershipFixture();
    const membership = await membershipService.assign(
      context.user,
      context.gym.id,
      context.member.id,
      { planId: context.membershipPlan.id, startDate: new Date().toISOString().slice(0, 10) },
    );
    const charge = await prisma.gymOsMemberCharge.findUniqueOrThrow({
      where: { membershipId: membership.id },
    });
    const partials = await Promise.allSettled(
      [1, 2].map(() =>
        memberFinanceService.record(context.user, context.gym.id, `pay-${randomUUID()}`, {
          chargeId: charge.id,
          amountMinor: 100000,
          method: GymOsMemberPaymentMethod.UPI,
        }),
      ),
    );
    expect(partials.filter((x) => x.status === 'fulfilled')).toHaveLength(2);
    const finals = await Promise.allSettled(
      [1, 2].map(() =>
        memberFinanceService.record(context.user, context.gym.id, `pay-${randomUUID()}`, {
          chargeId: charge.id,
          amountMinor: 100000,
          method: GymOsMemberPaymentMethod.CASH,
        }),
      ),
    );
    expect(finals.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.gymOsPaymentAllocation.aggregate({
        _sum: { amountMinor: true },
        where: { chargeId: charge.id, payment: { status: 'RECORDED' } },
      }),
    ).toMatchObject({ _sum: { amountMinor: 300000 } });
  });

  it('creates a separate renewal charge and reports reconciliation cleanly', async () => {
    const { gym, user, member, membershipPlan } = await membershipFixture();
    const original = await membershipService.assign(user, gym.id, member.id, {
      planId: membershipPlan.id,
      startDate: '2026-01-01',
    });
    const renewal = await membershipService.renew(user, gym.id, original.id, {
      planId: membershipPlan.id,
      startDate: '2027-01-01',
    });
    expect(
      await prisma.gymOsMemberCharge.count({
        where: { membershipId: { in: [original.id, renewal.id] } },
      }),
    ).toBe(2);
    await expect(memberFinanceService.reconcile(gym.id)).resolves.toEqual([]);
  });

  it('creates paid zero-price charges and enforces finance role and gym boundaries', async () => {
    const context = await membershipFixture();
    const free = await membershipService.createPlan(context.user, context.gym.id, {
      code: `FREE-${randomUUID()}`,
      name: 'Free access',
      durationType: GymOsMembershipDurationType.DAYS,
      durationValue: 7,
      priceMinor: 0,
      currency: 'INR',
    });
    await membershipService.planStatus(
      context.user,
      context.gym.id,
      free.id,
      GymOsMembershipPlanStatus.ACTIVE,
    );
    const membership = await membershipService.assign(
      context.user,
      context.gym.id,
      context.member.id,
      { planId: free.id, startDate: new Date().toISOString().slice(0, 10) },
    );
    await expect(
      prisma.gymOsMemberCharge.findUnique({ where: { membershipId: membership.id } }),
    ).resolves.toMatchObject({ amountMinor: 0, status: 'PAID' });
    const paidContext = await membershipFixture(),
      paidMembership = await membershipService.assign(
        paidContext.user,
        paidContext.gym.id,
        paidContext.member.id,
        { planId: paidContext.membershipPlan.id, startDate: new Date().toISOString().slice(0, 10) },
      ),
      charge = await prisma.gymOsMemberCharge.findUniqueOrThrow({
        where: { membershipId: paidMembership.id },
      });
    const staff = await prisma.user.create({
      data: { email: `${randomUUID()}@gymos.invalid`, status: 'ACTIVE' },
    });
    await prisma.gymMembership.create({
      data: { userId: staff.id, gymId: paidContext.gym.id, role: 'STAFF' },
    });
    const staffUser: AuthUser = {
      id: staff.id,
      sessionId: randomUUID(),
      roles: [RoleName.GYM_STAFF],
    };
    const payment = await memberFinanceService.record(
      staffUser,
      paidContext.gym.id,
      `pay-${randomUUID()}`,
      { chargeId: charge.id, amountMinor: 10000, method: GymOsMemberPaymentMethod.CASH },
    );
    await expect(
      memberFinanceService.reverse(staffUser, paidContext.gym.id, payment.id, 'Not allowed'),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_PAYMENT_FORBIDDEN' } });
    await expect(
      memberFinanceService.record(context.user, context.gym.id, `pay-${randomUUID()}`, {
        chargeId: charge.id,
        amountMinor: 10000,
        method: GymOsMemberPaymentMethod.CASH,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_CHARGE_NOT_FOUND' } });
  });

  it('allows one concurrent reversal effect and detects stored finance drift', async () => {
    const context = await membershipFixture(),
      membership = await membershipService.assign(context.user, context.gym.id, context.member.id, {
        planId: context.membershipPlan.id,
        startDate: new Date().toISOString().slice(0, 10),
      }),
      charge = await prisma.gymOsMemberCharge.findUniqueOrThrow({
        where: { membershipId: membership.id },
      }),
      payment = await memberFinanceService.record(
        context.user,
        context.gym.id,
        `pay-${randomUUID()}`,
        { chargeId: charge.id, amountMinor: 50000, method: GymOsMemberPaymentMethod.UPI },
      );
    const reversals = await Promise.allSettled([
      memberFinanceService.reverse(context.user, context.gym.id, payment.id, 'Duplicate entry'),
      memberFinanceService.reverse(context.user, context.gym.id, payment.id, 'Duplicate entry'),
    ]);
    expect(reversals.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.gymOsMemberPayment.count({ where: { id: payment.id, status: 'REVERSED' } }),
    ).toBe(1);
    await prisma.gymOsMemberCharge.update({ where: { id: charge.id }, data: { status: 'PAID' } });
    await expect(memberFinanceService.reconcile(context.gym.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chargeId: charge.id,
          code: 'STATUS_MISMATCH',
          expected: 'UNPAID',
        }),
      ]),
    );
  });

  it('returns authoritative analytics without client-provided totals', async () => {
    const context = await membershipFixture();
    await membershipService.assign(context.user, context.gym.id, context.member.id, {
      planId: context.membershipPlan.id,
      startDate: new Date().toISOString().slice(0, 10),
    });
    await expect(analyticsService.overview(context.user, context.gym.id)).resolves.toMatchObject({
      activeMembers: 1,
      activeMemberships: 1,
      outstandingMinor: 300000,
      collectionsThisMonthMinor: 0,
    });
  });

  it('creates disabled defaults and deduplicates concurrent manual reminders', async () => {
    const context = await membershipFixture();
    const membership = await membershipService.assign(
      context.user,
      context.gym.id,
      context.member.id,
      { planId: context.membershipPlan.id, startDate: new Date().toISOString().slice(0, 10) },
    );
    const rules = await reminderService.rules(context.user, context.gym.id);
    expect(rules.length).toBeGreaterThanOrEqual(7);
    expect(rules.every((x) => !x.enabled)).toBe(true);
    const dto = {
      memberId: context.member.id,
      type: GymOsReminderType.MEMBERSHIP_EXPIRING,
      channel: GymOsReminderChannel.WHATSAPP,
      subjectId: membership.id,
    };
    const outcomes = await Promise.allSettled([
      reminderService.manual(context.user, context.gym.id, dto),
      reminderService.manual(context.user, context.gym.id, dto),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.gymOsReminderDelivery.count({ where: { gymId: context.gym.id } })).toBe(1);
  });

  it('honors member opt-out and skips a stale payment reminder', async () => {
    const context = await membershipFixture();
    const membership = await membershipService.assign(
      context.user,
      context.gym.id,
      context.member.id,
      { planId: context.membershipPlan.id, startDate: new Date().toISOString().slice(0, 10) },
    );
    const charge = await prisma.gymOsMemberCharge.findUniqueOrThrow({
      where: { membershipId: membership.id },
    });
    await reminderService.updatePreference(context.user, context.gym.id, context.member.id, {
      allowTransactional: false,
      allowMarketing: false,
      allowWhatsApp: false,
      allowSms: false,
      allowEmail: false,
    });
    const delivery = await reminderService.manual(context.user, context.gym.id, {
      memberId: context.member.id,
      type: GymOsReminderType.PAYMENT_OVERDUE,
      channel: GymOsReminderChannel.WHATSAPP,
      subjectId: charge.id,
    });
    if (!delivery) throw new Error('Expected reminder delivery');
    expect(delivery.status).toBe('SKIPPED');
    expect(delivery.lastErrorCode).toBe('OPTED_OUT');
  });

  it('previews, schedules and cancels a server-segment campaign', async () => {
    const context = await membershipFixture();
    await membershipService.assign(context.user, context.gym.id, context.member.id, {
      planId: context.membershipPlan.id,
      startDate: new Date().toISOString().slice(0, 10),
    });
    const dto = {
      name: 'Overdue follow-up',
      type: GymOsReminderType.PAYMENT_OVERDUE,
      channel: GymOsReminderChannel.WHATSAPP,
      segment: 'OVERDUE' as const,
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    };
    await expect(campaignService.preview(context.user, context.gym.id, dto)).resolves.toMatchObject(
      { total: 0 },
    );
    const campaign = await campaignService.create(context.user, context.gym.id, dto);
    expect(campaign.status).toBe('SCHEDULED');
    await expect(
      campaignService.cancel(context.user, context.gym.id, campaign.id),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('applies a custom analytics period and deterministic attendance frequency', async () => {
    const context = await attendanceFixture();
    await attendanceService.checkIn(context.user, context.gym.id, {
      memberId: context.member.id,
      branchId: context.branch.id,
    });
    const today = new Date().toISOString().slice(0, 10),
      value = await analyticsService.overview(context.user, context.gym.id, {
        range: GymOsAnalyticsRange.CUSTOM,
        from: today,
        to: today,
      });
    expect(value.period.range).toBe('CUSTOM');
    expect(value.attendance).toMatchObject({
      activeMembersWithVisits: 1,
      zeroVisitActiveMembers: 0,
      frequency: { oneToTwo: 1 },
    });
    expect(value.branches[0]).toMatchObject({ visits: 1, unique_visitors: 1 });
  });

  it('claims duplicate dispatch once, retries transient failures, and recovers stale work', async () => {
    const context = await membershipFixture(),
      membership = await membershipService.assign(context.user, context.gym.id, context.member.id, {
        planId: context.membershipPlan.id,
        startDate: new Date().toISOString().slice(0, 10),
      });
    let calls = 0;
    const provider: GymOsMessagingProvider = {
      name: 'test',
      send: async () => {
        calls++;
        if (calls < 3) throw new Error('temporary');
        return { messageId: 'accepted' };
      },
    };
    const retrying = new GymOsReminderService(
        prisma,
        new GymAccessService(prisma),
        entitlements,
        provider,
        new GymOsReminderTimeService(prisma),
      ),
      delivery = await prisma.gymOsReminderDelivery.create({
        data: {
          gymId: context.gym.id,
          memberId: context.member.id,
          type: GymOsReminderType.MEMBERSHIP_EXPIRING,
          channel: GymOsReminderChannel.WHATSAPP,
          subjectType: 'MEMBERSHIP',
          subjectId: membership.id,
          scheduledFor: new Date(),
          dedupeKey: `retry-${randomUUID()}`,
        },
      });
    await retrying.dispatch(delivery.id);
    await retrying.dispatch(delivery.id);
    const results = await Promise.all([
      retrying.dispatch(delivery.id),
      retrying.dispatch(delivery.id),
    ]);
    expect(calls).toBe(3);
    expect(results.some((x) => x?.status === 'SENT')).toBe(true);
    const stale = await prisma.gymOsReminderDelivery.create({
      data: {
        gymId: context.gym.id,
        memberId: context.member.id,
        type: GymOsReminderType.MEMBERSHIP_EXPIRING,
        channel: GymOsReminderChannel.WHATSAPP,
        subjectType: 'MEMBERSHIP',
        subjectId: membership.id,
        scheduledFor: new Date(),
        attemptedAt: new Date(Date.now() - 3600000),
        status: 'PROCESSING',
        attemptCount: 1,
        dedupeKey: `stale-${randomUUID()}`,
      },
    });
    await expect(retrying.recoverStaleProcessing()).resolves.toMatchObject({ recovered: 1 });
    await expect(
      prisma.gymOsReminderDelivery.findUnique({ where: { id: stale.id } }),
    ).resolves.toMatchObject({ status: 'SCHEDULED' });
  });

  it('stops provider retries at five attempts', async () => {
    const context = await membershipFixture(),
      membership = await membershipService.assign(context.user, context.gym.id, context.member.id, {
        planId: context.membershipPlan.id,
        startDate: new Date().toISOString().slice(0, 10),
      });
    let calls = 0;
    const provider: GymOsMessagingProvider = {
      name: 'always-fails',
      send: async () => {
        calls++;
        throw new Error('permanent');
      },
    };
    const failing = new GymOsReminderService(
        prisma,
        new GymAccessService(prisma),
        entitlements,
        provider,
        new GymOsReminderTimeService(prisma),
      ),
      delivery = await prisma.gymOsReminderDelivery.create({
        data: {
          gymId: context.gym.id,
          memberId: context.member.id,
          type: GymOsReminderType.MEMBERSHIP_EXPIRING,
          channel: GymOsReminderChannel.WHATSAPP,
          subjectType: 'MEMBERSHIP',
          subjectId: membership.id,
          scheduledFor: new Date(),
          dedupeKey: `terminal-${randomUUID()}`,
        },
      });
    for (let attempt = 0; attempt < 6; attempt++) await failing.dispatch(delivery.id);
    expect(calls).toBe(5);
    await expect(
      prisma.gymOsReminderDelivery.findUnique({ where: { id: delivery.id } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      attemptCount: 5,
      lastErrorCode: 'PROVIDER_ERROR',
    });
  });

  it('executes a campaign from a fresh server-side segment and reconciles its counts', async () => {
    const context = await membershipFixture();
    await membershipService.assign(context.user, context.gym.id, context.member.id, {
      planId: context.membershipPlan.id,
      startDate: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10),
    });
    const campaign = await campaignService.create(context.user, context.gym.id, {
      name: 'Inactive members',
      type: GymOsReminderType.INACTIVITY,
      channel: GymOsReminderChannel.WHATSAPP,
      segment: 'NO_VISIT_14_DAYS',
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    });
    await prisma.gymOsReminderCampaign.update({
      where: { id: campaign.id },
      data: { scheduledFor: new Date(Date.now() - 1000) },
    });
    await campaignService.processDue();
    await reminderService.processDue();
    await campaignService.reconcileProcessing();
    const listed = await campaignService.list(context.user, context.gym.id, {
      page: 1,
      pageSize: 20,
    });
    expect(listed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: campaign.id,
          status: 'COMPLETED',
          deliverySummary: expect.objectContaining({ sent: 1 }),
        }),
      ]),
    );
  });

  it('enforces the per-member manual reminder cap with a stable error', async () => {
    const context = await membershipFixture(),
      membership = await membershipService.assign(context.user, context.gym.id, context.member.id, {
        planId: context.membershipPlan.id,
        startDate: new Date().toISOString().slice(0, 10),
      });
    for (const channel of [GymOsReminderChannel.WHATSAPP, GymOsReminderChannel.SMS])
      await reminderService.manual(context.user, context.gym.id, {
        memberId: context.member.id,
        type: GymOsReminderType.MEMBERSHIP_EXPIRING,
        channel,
        subjectId: membership.id,
      });
    await expect(
      reminderService.manual(context.user, context.gym.id, {
        memberId: context.member.id,
        type: GymOsReminderType.MEMBERSHIP_EXPIRING,
        channel: GymOsReminderChannel.EMAIL,
        subjectId: membership.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_REMINDER_RATE_LIMITED' } });
  });

  it('enforces actor and gym manual reminder caps', async () => {
    const actorContext = await membershipFixture(),
      actorMembership = await membershipService.assign(
        actorContext.user,
        actorContext.gym.id,
        actorContext.member.id,
        {
          planId: actorContext.membershipPlan.id,
          startDate: new Date().toISOString().slice(0, 10),
        },
      );
    await prisma.auditLog.createMany({
      data: Array.from({ length: 20 }, () => ({
        actorUserId: actorContext.user.id,
        action: AuditAction.GYMOS_REMINDER_MANUAL_REQUESTED,
        entityType: 'GymOsReminderDelivery',
        entityId: randomUUID(),
        metadata: { gymId: actorContext.gym.id },
      })),
    });
    await expect(
      reminderService.manual(actorContext.user, actorContext.gym.id, {
        memberId: actorContext.member.id,
        type: GymOsReminderType.MEMBERSHIP_EXPIRING,
        channel: GymOsReminderChannel.WHATSAPP,
        subjectId: actorMembership.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_REMINDER_RATE_LIMITED' } });
    const gymContext = await membershipFixture(),
      gymMembership = await membershipService.assign(
        gymContext.user,
        gymContext.gym.id,
        gymContext.member.id,
        { planId: gymContext.membershipPlan.id, startDate: new Date().toISOString().slice(0, 10) },
      );
    await prisma.gymOsReminderDelivery.createMany({
      data: Array.from({ length: 200 }, () => ({
        gymId: gymContext.gym.id,
        memberId: gymContext.member.id,
        type: GymOsReminderType.INACTIVITY,
        channel: GymOsReminderChannel.WHATSAPP,
        subjectType: 'MEMBER',
        subjectId: gymContext.member.id,
        scheduledFor: new Date(),
        dedupeKey: `gym-cap-${randomUUID()}`,
      })),
    });
    await expect(
      reminderService.manual(gymContext.user, gymContext.gym.id, {
        memberId: gymContext.member.id,
        type: GymOsReminderType.MEMBERSHIP_EXPIRING,
        channel: GymOsReminderChannel.WHATSAPP,
        subjectId: gymMembership.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_REMINDER_RATE_LIMITED' } });
  });

  it('enforces the daily campaign scheduling cap', async () => {
    const context = await membershipFixture(),
      base = {
        type: GymOsReminderType.INACTIVITY,
        channel: GymOsReminderChannel.WHATSAPP,
        segment: 'NO_VISIT_14_DAYS' as const,
        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      };
    for (let index = 0; index < 10; index++)
      await campaignService.create(context.user, context.gym.id, {
        ...base,
        name: `Campaign ${index}`,
      });
    await expect(
      campaignService.create(context.user, context.gym.id, { ...base, name: 'Campaign 11' }),
    ).rejects.toMatchObject({ response: { code: 'GYMOS_REMINDER_RATE_LIMITED' } });
  });
});
