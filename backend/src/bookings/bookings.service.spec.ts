import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  BookingStatus,
  BranchStatus,
  GymStatus,
  PlanStatus,
  PlanType,
  SlotStatus,
} from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { bookingSelect, BookingsService } from './bookings.service';

const user = (id: string) => ({ id, roles: ['CUSTOMER'] as never, sessionId: 'session' });

describe('BookingsService', () => {
  it('selects customer-safe payment/refund status and branch timezone without financial internals', () => {
    expect(bookingSelect.branch.select.timezone).toBe(true);
    expect(Object.keys(bookingSelect.payment.select).sort()).toEqual(
      ['id', 'status', 'amount', 'currency', 'refundedAmount', 'refunds'].sort(),
    );
    expect(Object.keys(bookingSelect.payment.select.refunds.select).sort()).toEqual(
      ['id', 'amount', 'status', 'createdAt'].sort(),
    );
    expect(Object.keys(bookingSelect.checkIn.select).sort()).toEqual(
      ['id', 'status', 'method', 'verifiedAt', 'completedAt', 'verifiedBy'].sort(),
    );
    expect(bookingSelect.checkIn.select).not.toHaveProperty('tokens');
    expect(bookingSelect.checkIn.select).not.toHaveProperty('otpChallenges');
  });
  it('returns the original booking for a matching idempotency retry', async () => {
    const dto = { planId: 'plan', branchId: 'branch' };
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ branchId: dto.branchId, planId: dto.planId, slotId: null }))
      .digest('hex');
    const original = { id: 'booking', status: BookingStatus.PAYMENT_PENDING };
    const prisma = {
      booking: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'booking', requestFingerprint: fingerprint }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(original),
      },
    };
    const service = new BookingsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService(),
    );
    await expect(service.create(user('user'), dto, 'same-key')).resolves.toEqual(original);
  });

  it('rejects an idempotency key reused for a different request', async () => {
    const prior = { id: 'booking', requestFingerprint: 'different' };
    const prisma = { booking: { findUnique: jest.fn().mockResolvedValue(prior) } };
    const service = new BookingsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService(),
    );
    await expect(
      service.create(user('user'), { planId: 'plan', branchId: 'branch' }, 'same-key'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ApiErrorCode.IDEMPOTENCY_KEY_CONFLICT }),
    });
  });

  it('scopes customer detail reads by authenticated user to prevent IDOR', async () => {
    const prisma = { booking: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new BookingsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService(),
    );
    await expect(service.getMine('user-a', 'booking-b')).rejects.toBeInstanceOf(DomainException);
    expect(prisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'booking-b', userId: 'user-a' } }),
    );
  });

  it('checks partner branch authorization before returning a booking', async () => {
    const prisma = {
      booking: { findUnique: jest.fn().mockResolvedValue({ id: 'booking', branchId: 'branch-b' }) },
    };
    const access = {
      assertBranchManagement: jest
        .fn()
        .mockRejectedValue(
          new DomainException(ApiErrorCode.BRANCH_NOT_FOUND, 'Branch not found', 404),
        ),
    };
    const service = new BookingsService(
      prisma as never,
      access as never,
      {} as never,
      {} as never,
      new ConfigService(),
    );
    await expect(service.getPartner(user('partner-a'), 'booking')).rejects.toBeInstanceOf(
      DomainException,
    );
    expect(access.assertBranchManagement).toHaveBeenCalledWith(expect.anything(), 'branch-b');
  });

  it('allows exactly one concurrent reservation when capacity is one', async () => {
    let bookings = 0;
    let chain = Promise.resolve();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'slot' }]),
      gymPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'plan',
          gymId: 'gym',
          name: 'Day pass',
          type: PlanType.DAY_PASS,
          priceMinor: 19900,
          currency: 'INR',
          status: PlanStatus.ACTIVE,
          gym: { status: GymStatus.APPROVED },
          branches: [{ branchId: 'branch' }],
        }),
      },
      gymBranch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'branch',
          gymId: 'gym',
          status: BranchStatus.ACTIVE,
          slotConfig: { minimumAdvanceMinutes: 0, bookingWindowDays: 30 },
        }),
      },
      slotInstance: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'slot',
          branchId: 'branch',
          status: SlotStatus.AVAILABLE,
          capacity: 1,
          startAt: new Date(Date.now() + 86_400_000),
        }),
      },
      booking: {
        count: jest.fn((args: { where: { userId?: string } }) =>
          Promise.resolve(args.where.userId ? 0 : bookings),
        ),
        create: jest.fn(({ data }: { data: { userId: string } }) => {
          bookings += 1;
          return Promise.resolve({
            id: `booking-${data.userId}`,
            slotId: 'slot',
            reservationExpiresAt: new Date(Date.now() + 600_000),
          });
        }),
      },
    };
    const prisma = {
      booking: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => {
        const run = chain.then(() => callback(tx));
        chain = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      }),
    };
    const locks = {
      withSlotLock: jest.fn((_slot: string, operation: () => Promise<unknown>) => operation()),
    };
    const expiration = { schedule: jest.fn().mockResolvedValue(undefined) };
    const service = new BookingsService(
      prisma as never,
      {} as never,
      locks as never,
      expiration as never,
      new ConfigService({ BOOKING_RESERVATION_TTL_SECONDS: 600 }),
    );
    const attempts = await Promise.allSettled([
      service.create(
        user('a'),
        { planId: 'plan', branchId: 'branch', slotId: 'slot' },
        'request-a',
      ),
      service.create(
        user('b'),
        { planId: 'plan', branchId: 'branch', slotId: 'slot' },
        'request-b',
      ),
    ]);
    expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((item) => item.status === 'rejected')).toHaveLength(1);
    expect(bookings).toBe(1);
  });
});
