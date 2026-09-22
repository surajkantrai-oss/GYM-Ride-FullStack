import { Prisma } from '@prisma/client';
import { ReviewsService } from './reviews.service';

describe('ReviewsService authorization and invariants', () => {
  const customerId = 'customer-a';
  const bookingId = 'booking-a';
  const booking = { id: bookingId, status: 'COMPLETED', gymId: 'gym-a', branchId: 'branch-a' };
  const make = () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      booking: { findFirst: jest.fn().mockResolvedValue(booking) },
      review: {
        create: jest.fn().mockResolvedValue({ id: 'review-a', bookingId, rating: 5 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'review-a', status: 'PUBLISHED' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'review-a', gymId: 'gym-a', status: 'PUBLISHED' }),
        update: jest.fn().mockResolvedValue({ id: 'review-a', rating: 4 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } }),
      },
      gym: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Gym', ownerId: 'owner-a', memberships: [] }), findFirst: jest.fn().mockResolvedValue({ id: 'gym-a' }) },
      gymBranch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-a' }) },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'notification-a' }) },
      pushDevice: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = {
      ...tx,
      $transaction: jest.fn((value: unknown) => typeof value === 'function' ? (value as (client: typeof tx) => Promise<unknown>)(tx) : Promise.all(value as Promise<unknown>[])),
    };
    const access = { assertGymManagement: jest.fn().mockResolvedValue(undefined) };
    return { db, access, service: new ReviewsService(db as never, access as never) };
  };

  it('creates only from an owned completed booking and derives the gym/branch server-side', async () => {
    const { db, service } = make();
    await service.create(customerId, bookingId, { rating: 5, title: 'Great' });
    expect(db.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: bookingId, userId: customerId } }));
    expect(db.review.create).toHaveBeenCalledWith({ data: expect.objectContaining({ customerId, bookingId, gymId: 'gym-a', branchId: 'branch-a', rating: 5 }) });
    expect(db.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it.each(['PAYMENT_PENDING', 'CONFIRMED', 'CHECK_IN_AVAILABLE', 'CHECKED_IN', 'NO_SHOW', 'REFUNDED'])('rejects %s bookings', async (status) => {
    const { db, service } = make();
    db.booking.findFirst.mockResolvedValue({ ...booking, status });
    await expect(service.create(customerId, bookingId, { rating: 5 })).rejects.toMatchObject({ status: 409 });
    expect(db.review.create).not.toHaveBeenCalled();
  });

  it('returns not found for another customer booking and private review', async () => {
    const { db, service } = make();
    db.booking.findFirst.mockResolvedValue(null);
    await expect(service.create('customer-b', bookingId, { rating: 5 })).rejects.toMatchObject({ status: 404 });
    await expect(service.mine('customer-b', bookingId)).rejects.toMatchObject({ status: 404 });
  });

  it('maps concurrent unique-constraint conflicts to stable duplicate error', async () => {
    const { db, service } = make();
    db.review.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6.19.3' }));
    await expect(service.create(customerId, bookingId, { rating: 5 })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REVIEW_ALREADY_EXISTS' }) });
  });

  it.each([0, -1, 6, 2.5])('rejects invalid rating %s before writing', async (rating) => {
    const { db, service } = make();
    await expect(service.create(customerId, bookingId, { rating })).rejects.toMatchObject({ status: 400, response: expect.objectContaining({ code: 'INVALID_REVIEW_RATING' }) });
    expect(db.review.create).not.toHaveBeenCalled();
  });

  it('edits only owned, non-removed reviews without changing their identity or moderation status', async () => {
    const { db, service } = make();
    await service.edit(customerId, bookingId, { rating: 4, comment: 'Updated' });
    expect(db.review.update).toHaveBeenCalledWith({ where: { id: 'review-a' }, data: expect.objectContaining({ rating: 4, comment: 'Updated', editedAt: expect.any(Date) }) });
    db.review.findFirst.mockResolvedValue({ id: 'review-a', status: 'REMOVED' });
    await expect(service.edit(customerId, bookingId, { rating: 3 })).rejects.toMatchObject({ status: 409 });
  });

  it('shows only published reviews and privacy-safe public fields', async () => {
    const { db, service } = make();
    await service.publicList('gym-a', { page: 1, limit: 20 });
    expect(db.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { gymId: 'gym-a', status: 'PUBLISHED' } }));
    expect(db.review.findMany.mock.calls[0][0].select).not.toHaveProperty('customer.email');
  });

  it('scopes partner details and audits moderation with previous/new status', async () => {
    const { db, access, service } = make();
    await service.partnerGet({ id: 'partner-a', roles: [], sessionId: 's' }, 'review-a');
    expect(access.assertGymManagement).toHaveBeenCalledWith(expect.anything(), 'gym-a');
    await service.moderate('admin-a', 'review-a', { status: 'HIDDEN', reason: 'Inappropriate content' });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'REVIEW_MODERATED', metadata: expect.objectContaining({ previousStatus: 'PUBLISHED', newStatus: 'HIDDEN' }) }) });
  });
});
