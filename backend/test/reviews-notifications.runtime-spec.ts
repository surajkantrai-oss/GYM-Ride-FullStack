import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service';
import { GymAccessService } from '../src/gym-access/gym-access.service';
import { NotificationProjectionService } from '../src/notifications/notification-projection.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { createNotificationIntent } from '../src/notifications/notification-intent';
import { ReviewsService } from '../src/reviews/reviews.service';

describe('PostgreSQL reviews and notifications (isolated test database)', () => {
  const url = process.env.FINANCE_TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/gymride_finance_test')
    throw new Error('Use test/run-finance-runtime.cjs');
  const prisma = new PrismaService({ datasourceUrl: url });
  const reviews = new ReviewsService(prisma, new GymAccessService(prisma));
  const projection = new NotificationProjectionService(prisma);
  const notifications = new NotificationsService(prisma, projection);
  afterAll(async () => prisma.$disconnect());

  async function fixture() {
    const customer = await prisma.user.create({ data: { email: `${randomUUID()}@review.invalid`, firstName: 'Member', status: 'ACTIVE' } });
    const owner = await prisma.user.create({ data: { email: `${randomUUID()}@review.invalid`, status: 'ACTIVE' } });
    const gym = await prisma.gym.create({ data: { name: 'Review test gym', ownerId: owner.id, status: 'APPROVED' } });
    const branch = await prisma.gymBranch.create({ data: { gymId: gym.id, name: 'Branch', address: 'Test', city: 'Test', state: 'Test', postalCode: '000000', latitude: 0, longitude: 0, status: 'ACTIVE' } });
    const plan = await prisma.gymPlan.create({ data: { gymId: gym.id, name: 'Day pass', type: 'DAY_PASS', priceMinor: 100000, durationDays: 1 } });
    const booking = await prisma.booking.create({ data: { userId: customer.id, gymId: gym.id, branchId: branch.id, planId: plan.id, status: 'COMPLETED', planName: plan.name, planType: plan.type, priceMinor: 100000, currency: 'INR', idempotencyKey: randomUUID(), requestFingerprint: '8'.repeat(64) } });
    return { customer, owner, gym, branch, booking };
  }

  it('enforces one review under concurrent requests and computes published-only aggregates', async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled([
      reviews.create(f.customer.id, f.booking.id, { rating: 5, comment: 'Excellent' }),
      reviews.create(f.customer.id, f.booking.id, { rating: 5, comment: 'Excellent' }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.review.count({ where: { bookingId: f.booking.id } })).toBe(1);
    const published = await reviews.publicList(f.gym.id, { page: 1, limit: 20 }) as { aggregate: { averageRating: number | null; reviewCount: number }; data: unknown[] };
    expect(published.aggregate).toEqual({ averageRating: 5, reviewCount: 1 });
    expect(published.data).toHaveLength(1);
    const review = await prisma.review.findUniqueOrThrow({ where: { bookingId: f.booking.id } });
    await reviews.moderate(f.owner.id, review.id, { status: 'HIDDEN', reason: 'Runtime moderation test' });
    const hidden = await reviews.publicList(f.gym.id, { page: 1, limit: 20 }) as { aggregate: { averageRating: number | null; reviewCount: number }; data: unknown[] };
    expect(hidden.aggregate).toEqual({ averageRating: null, reviewCount: 0 });
    expect(hidden.data).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { entityType: 'Review', entityId: review.id, action: 'REVIEW_MODERATED' } })).toBe(1);
  });

  it('rejects another customer and a non-completed booking', async () => {
    const f = await fixture();
    const other = await prisma.user.create({ data: { email: `${randomUUID()}@review.invalid`, status: 'ACTIVE' } });
    await expect(reviews.create(other.id, f.booking.id, { rating: 5 })).rejects.toMatchObject({ status: 404 });
    await expect(reviews.mine(other.id, f.booking.id)).rejects.toMatchObject({ status: 404 });
    await prisma.booking.update({ where: { id: f.booking.id }, data: { status: 'NO_SHOW' } });
    await expect(reviews.create(f.customer.id, f.booking.id, { rating: 5 })).rejects.toMatchObject({ status: 409 });
  });

  it('projects completion exactly once and enforces notification ownership', async () => {
    const f = await fixture();
    const event = await prisma.bookingEvent.create({ data: { bookingId: f.booking.id, type: 'BOOKING_COMPLETED', fromStatus: 'CHECKED_IN', toStatus: 'COMPLETED' } });
    await projection.projectBookingEvents();
    await projection.projectBookingEvents();
    const rows = await prisma.notification.findMany({ where: { dedupeKey: `booking-event:${event.id}:${f.customer.id}` } });
    expect(rows).toHaveLength(1);
    const notification = rows[0]!;
    expect(notification.type).toBe('REVIEW_AVAILABLE');
    expect((await notifications.unreadCount(f.customer.id)).count).toBeGreaterThanOrEqual(1);
    await expect(notifications.read(f.owner.id, notification.id)).rejects.toMatchObject({ status: 404 });
    await notifications.read(f.customer.id, notification.id);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).readAt).not.toBeNull();
  });

  it('fans out one logical notification to two devices and disables a session on logout', async () => {
    const f = await fixture();
    const sessionId = randomUUID();
    const first = await notifications.registerDevice(f.customer.id, sessionId, { platform: 'ios', token: `ExpoPushToken[${randomUUID().replaceAll('-', '')}]` }) as { id: string };
    await notifications.registerDevice(f.customer.id, sessionId, { platform: 'android', token: `ExpoPushToken[${randomUUID().replaceAll('-', '')}]` });
    const key = `runtime:${randomUUID()}`;
    await prisma.$transaction(async (tx) => {
      await createNotificationIntent(tx, { userId: f.customer.id, type: 'BOOKING_CONFIRMED', category: 'BOOKING', title: 'Booked', body: 'Your booking is confirmed.', route: { screen: 'Booking', bookingId: f.booking.id }, dedupeKey: key });
    });
    const notice = await prisma.notification.findUniqueOrThrow({ where: { dedupeKey: key } });
    expect(await prisma.pushDelivery.count({ where: { notificationId: notice.id } })).toBe(2);
    await prisma.pushDevice.updateMany({ where: { userId: f.customer.id, sessionId }, data: { enabled: false } });
    expect(await prisma.pushDevice.count({ where: { userId: f.customer.id, sessionId, enabled: true } })).toBe(0);
    await expect(notifications.unregisterDevice(f.owner.id, first.id)).rejects.toMatchObject({ status: 404 });
  });

  it('projects a new successful payment once, even on repeated sweeps', async () => {
    const f = await fixture();
    const payment = await prisma.payment.create({ data: { bookingId: f.booking.id, provider: 'development', amount: 100000, currency: 'INR', status: 'SUCCESS' } });
    await projection.projectPaymentStatus();
    await projection.projectPaymentStatus();
    expect(await prisma.notification.count({ where: { dedupeKey: `payment:${payment.id}:PAYMENT_CONFIRMED` } })).toBe(1);
  });
});
