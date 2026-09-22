import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { RoleName } from '@prisma/client';
import { CheckInOtpService } from '../src/check-ins/check-in-otp.service';
import { CheckInPolicy } from '../src/check-ins/check-in.policy';
import { CheckInService } from '../src/check-ins/check-in.service';
import { CheckInTokenService } from '../src/check-ins/check-in-token.service';
import { CheckInVerificationService } from '../src/check-ins/check-in-verification.service';
import { PrismaService } from '../src/database/prisma.service';
import { GymAccessService } from '../src/gym-access/gym-access.service';

describe('PostgreSQL secure check-in concurrency', () => {
  const url = process.env.FINANCE_TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/gymride_finance_test')
    throw new Error('Use test/run-finance-runtime.cjs');
  const prisma = new PrismaService({ datasourceUrl: url });
  const config = new ConfigService({
    CHECK_IN_TOKEN_SECRET: 'runtime-check-in-secret-that-is-long-enough',
    CHECK_IN_TOKEN_TTL_SECONDS: 180,
    CHECK_IN_OPEN_BEFORE_MINUTES: 15,
    CHECK_IN_CLOSE_AFTER_MINUTES: 30,
    CHECK_IN_COMPLETION_GRACE_MINUTES: 15,
    CHECK_IN_OTP_TTL_SECONDS: 180,
    CHECK_IN_OTP_MAX_ATTEMPTS: 3,
    CHECK_IN_OTP_RESEND_COOLDOWN_SECONDS: 0,
    CHECK_IN_OTP_REQUEST_LIMIT: 5,
    CHECK_IN_OTP_REQUEST_WINDOW_SECONDS: 3600,
  });
  const policy = new CheckInPolicy(config);
  const checkIns = new CheckInService(prisma, policy);
  const tokens = new CheckInTokenService(prisma, checkIns, config);
  const otps = new CheckInOtpService(prisma, checkIns, config);
  const verification = new CheckInVerificationService(
    new GymAccessService(prisma),
    tokens,
    otps,
    checkIns,
  );

  afterAll(async () => prisma.$disconnect());

  it('stores only a QR token hash and accepts exactly one concurrent verification', async () => {
    const f = await fixture();
    const issued = (await tokens.issue(f.customer.id, f.booking.id)) as {
      token: string;
      expiresAt: Date;
    };
    const stored = await prisma.checkInToken.findFirstOrThrow({
      where: { checkIn: { bookingId: f.booking.id } },
    });
    expect(stored.tokenHash).not.toContain(issued.token);
    expect(stored.tokenHash).toHaveLength(64);
    const actor = { id: f.staff.id, roles: [RoleName.GYM_STAFF], sessionId: 'runtime' };
    const outcomes = await Promise.allSettled([
      verification.verifyQr(actor, issued.token),
      verification.verifyQr(actor, issued.token),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).status).toBe(
      'CHECKED_IN',
    );
    expect(
      await prisma.bookingEvent.count({
        where: { bookingId: f.booking.id, type: 'QR_CHECK_IN_VERIFIED' },
      }),
    ).toBe(1);
  });

  it('expires QR tokens authoritatively', async () => {
    const f = await fixture();
    const issued = (await tokens.issue(f.customer.id, f.booking.id)) as { token: string };
    await prisma.checkInToken.updateMany({
      where: { checkIn: { bookingId: f.booking.id } },
      data: { expiresAt: new Date(0) },
    });
    await expect(tokens.verify(issued.token, f.staff.id)).rejects.toMatchObject({ status: 400 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).status).toBe(
      'CHECK_IN_AVAILABLE',
    );
  });

  it('rejects invalid/tampered tokens and customer IDOR without changing the booking', async () => {
    const f = await fixture();
    const issued = (await tokens.issue(f.customer.id, f.booking.id)) as { token: string };
    const other = await prisma.user.create({
      data: { email: `${randomUUID()}@check-in.invalid`, status: 'ACTIVE' },
    });
    await expect(tokens.issue(other.id, f.booking.id)).rejects.toMatchObject({ status: 404 });
    await expect(checkIns.getCustomer(other.id, f.booking.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(tokens.verify(`${issued.token}x`, f.staff.id)).rejects.toMatchObject({
      status: 400,
    });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).status).toBe(
      'CHECK_IN_AVAILABLE',
    );
  });

  it.each(['CANCELLED', 'REFUNDED', 'EXPIRED', 'PAYMENT_FAILED'] as const)(
    'never issues a credential for %s bookings',
    async (status) => {
      const f = await fixture();
      await prisma.booking.update({ where: { id: f.booking.id }, data: { status } });
      await expect(tokens.issue(f.customer.id, f.booking.id)).rejects.toMatchObject({
        status: 409,
      });
      await expect(otps.issue(f.customer.id, f.booking.id)).rejects.toMatchObject({
        status: 409,
      });
    },
  );

  it('tracks wrong OTP attempts without storing plaintext and verifies the valid fallback', async () => {
    const f = await fixture();
    const issued = (await otps.issue(f.customer.id, f.booking.id)) as { code: string };
    const challenge = await prisma.checkInOtpChallenge.findFirstOrThrow({
      where: { checkIn: { bookingId: f.booking.id } },
    });
    expect(challenge.codeHash).not.toContain(issued.code);
    await expect(otps.verify(f.booking.id, '000000', f.staff.id)).rejects.toMatchObject({
      status: 400,
    });
    expect(
      (await prisma.checkInOtpChallenge.findUniqueOrThrow({ where: { id: challenge.id } }))
        .attempts,
    ).toBe(1);
    await expect(otps.verify(f.booking.id, issued.code, f.staff.id)).resolves.toBe(f.booking.id);
    await expect(otps.verify(f.booking.id, issued.code, f.staff.id)).rejects.toBeDefined();
  });

  it('accepts exactly one simultaneous OTP verification', async () => {
    const f = await fixture();
    const issued = (await otps.issue(f.customer.id, f.booking.id)) as { code: string };
    const outcomes = await Promise.allSettled([
      otps.verify(f.booking.id, issued.code, f.staff.id),
      otps.verify(f.booking.id, issued.code, f.staff.id),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.bookingEvent.count({
        where: { bookingId: f.booking.id, type: 'OTP_CHECK_IN_VERIFIED' },
      }),
    ).toBe(1);
  });

  it('expires and attempt-limits booking-bound OTP challenges', async () => {
    const expired = await fixture();
    const expiredCode = (await otps.issue(expired.customer.id, expired.booking.id)) as {
      code: string;
    };
    await prisma.checkInOtpChallenge.updateMany({
      where: { checkIn: { bookingId: expired.booking.id } },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      otps.verify(expired.booking.id, expiredCode.code, expired.staff.id),
    ).rejects.toMatchObject({ status: 400 });

    const limited = await fixture();
    await otps.issue(limited.customer.id, limited.booking.id);
    await expect(otps.verify(limited.booking.id, '000000', limited.staff.id)).rejects.toBeDefined();
    await expect(otps.verify(limited.booking.id, '000000', limited.staff.id)).rejects.toBeDefined();
    await expect(otps.verify(limited.booking.id, '000000', limited.staff.id)).rejects.toMatchObject(
      {
        status: 429,
      },
    );
    await expect(otps.verify(randomUUID(), '000000', limited.staff.id)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects a staff member from another branch before consuming a credential', async () => {
    const f = await fixture();
    const issued = (await tokens.issue(f.customer.id, f.booking.id)) as { token: string };
    const outsider = await prisma.user.create({
      data: { email: `${randomUUID()}@check-in.invalid`, status: 'ACTIVE' },
    });
    await expect(
      verification.verifyQr(
        { id: outsider.id, roles: [RoleName.GYM_STAFF], sessionId: 'runtime' },
        issued.token,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const stored = await prisma.checkInToken.findFirstOrThrow({
      where: { checkIn: { bookingId: f.booking.id } },
    });
    expect(stored.consumedAt).toBeNull();
  });

  it('enforces early and closed windows and advances no-show/completion states', async () => {
    const early = await fixture(60, 120);
    await expect(tokens.issue(early.customer.id, early.booking.id)).rejects.toMatchObject({
      status: 409,
    });
    const missed = await fixture(-120, -60);
    await checkIns.syncBooking(missed.booking.id);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: missed.booking.id } })).status,
    ).toBe('NO_SHOW');
    const completed = await fixture(-120, -30, 'CHECKED_IN');
    await checkIns.syncBooking(completed.booking.id);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: completed.booking.id } })).status,
    ).toBe('COMPLETED');
  });

  it('deduplicates simultaneous completion and no-show workers', async () => {
    const missed = await fixture(-120, -60);
    await Promise.all([
      checkIns.syncBooking(missed.booking.id),
      checkIns.syncBooking(missed.booking.id),
    ]);
    expect(
      await prisma.bookingEvent.count({
        where: { bookingId: missed.booking.id, type: 'BOOKING_NO_SHOW' },
      }),
    ).toBe(1);
    const completed = await fixture(-120, -30, 'CHECKED_IN');
    await Promise.all([
      checkIns.syncBooking(completed.booking.id),
      checkIns.syncBooking(completed.booking.id),
    ]);
    expect(
      await prisma.bookingEvent.count({
        where: { bookingId: completed.booking.id, type: 'BOOKING_COMPLETED' },
      }),
    ).toBe(1);
  });

  async function fixture(
    startOffsetMinutes = 1,
    endOffsetMinutes = 61,
    status: 'CONFIRMED' | 'CHECKED_IN' = 'CONFIRMED',
  ) {
    const customer = await prisma.user.create({
      data: { email: `${randomUUID()}@check-in.invalid`, firstName: 'Customer', status: 'ACTIVE' },
    });
    const staff = await prisma.user.create({
      data: { email: `${randomUUID()}@check-in.invalid`, firstName: 'Staff', status: 'ACTIVE' },
    });
    const owner = await prisma.user.create({
      data: { email: `${randomUUID()}@check-in.invalid`, status: 'ACTIVE' },
    });
    const gym = await prisma.gym.create({
      data: { name: 'Check-in runtime gym', ownerId: owner.id },
    });
    const branch = await prisma.gymBranch.create({
      data: {
        gymId: gym.id,
        name: 'Branch',
        address: 'Test',
        city: 'Test',
        state: 'Test',
        postalCode: '000000',
        latitude: 0,
        longitude: 0,
      },
    });
    await prisma.gymMembership.create({
      data: { userId: staff.id, gymId: gym.id, branchId: branch.id, role: 'STAFF' },
    });
    const plan = await prisma.gymPlan.create({
      data: {
        gymId: gym.id,
        name: 'Day pass',
        type: 'DAY_PASS',
        priceMinor: 100000,
        durationDays: 1,
      },
    });
    const now = Date.now();
    const slot = await prisma.slotInstance.create({
      data: {
        branchId: branch.id,
        startAt: new Date(now + startOffsetMinutes * 60_000),
        endAt: new Date(now + endOffsetMinutes * 60_000),
        capacity: 10,
      },
    });
    const booking = await prisma.booking.create({
      data: {
        userId: customer.id,
        gymId: gym.id,
        branchId: branch.id,
        planId: plan.id,
        slotId: slot.id,
        status,
        planName: plan.name,
        planType: plan.type,
        priceMinor: 100000,
        currency: 'INR',
        idempotencyKey: randomUUID(),
        requestFingerprint: '7'.repeat(64),
        checkIn:
          status === 'CHECKED_IN'
            ? {
                create: {
                  customerId: customer.id,
                  gymId: gym.id,
                  branchId: branch.id,
                  status: 'VERIFIED',
                  method: 'QR',
                  verifiedByUserId: staff.id,
                  verifiedAt: new Date(now - 60_000),
                },
              }
            : undefined,
        payment: {
          create: {
            provider: 'development',
            providerOrderId: randomUUID(),
            providerPaymentId: randomUUID(),
            amount: 100000,
            currency: 'INR',
            status: 'SUCCESS',
            capturedAt: new Date(),
          },
        },
      },
    });
    return { customer, staff, owner, gym, branch, plan, slot, booking };
  }
});
