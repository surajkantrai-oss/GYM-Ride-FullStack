import { Injectable, Logger } from '@nestjs/common';
import { NotificationCategory, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { createNotificationIntent } from './notification-intent';
import { bookingNotificationIntents } from './notification-template';

const source = 'booking-events';
const zeroId = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class NotificationProjectionService {
  private readonly logger = new Logger(NotificationProjectionService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Cursor and notification writes commit together, making replay safe after a crash. */
  async projectBookingEvents(batchSize = 100): Promise<number> {
    await this.prisma.notificationProjectionCursor.upsert({
      where: { source },
      create: { source, lastCreatedAt: new Date(0), lastId: zeroId },
      update: {},
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT source FROM notification_projection_cursors WHERE source = ${source} FOR UPDATE`;
      const cutoff = await tx.notificationProjectionCursor.findUniqueOrThrow({ where: { source } });
      const pending = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT e.id FROM booking_events e
        WHERE e.created_at >= ${cutoff.lastCreatedAt}
          AND NOT EXISTS (
            SELECT 1 FROM notification_projections p
            WHERE p.source = ${source} AND p.source_id = e.id
          )
        ORDER BY e.created_at ASC, e.id ASC
        LIMIT ${batchSize}
        FOR UPDATE OF e SKIP LOCKED
      `);
      const events = await tx.bookingEvent.findMany({
        where: { id: { in: pending.map((item) => item.id) } },
        include: { booking: { select: { id: true, userId: true, gymId: true, gym: { select: { name: true } } } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      for (const event of events) {
        for (const intent of bookingNotificationIntents(event))
          await createNotificationIntent(tx, intent);
        await tx.notificationProjection.create({ data: { source, sourceId: event.id } });
      }
      if (events.length) this.logger.log({ projected: events.length }, 'Booking notifications projected');
      return events.length;
    });
  }

  async catchUp(maxBatches = 10): Promise<number> {
    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      const count = await this.projectBookingEvents();
      total += count;
      if (count < 100) break;
    }
    total += await this.projectPaymentStatus();
    total += await this.projectRefundStatus();
    total += await this.projectPaidSettlements();
    return total;
  }

  async projectPaymentStatus(): Promise<number> {
    const name = 'payment-status';
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p.id FROM payments p
        WHERE p.status IN ('SUCCESS', 'FAILED')
          AND NOT EXISTS (SELECT 1 FROM notification_projections n WHERE n.source = ${name} AND n.source_id = p.id)
        ORDER BY p.updated_at ASC, p.id ASC LIMIT 100 FOR UPDATE OF p SKIP LOCKED
      `);
      const rows = await tx.payment.findMany({
        where: { id: { in: pending.map((item) => item.id) } },
        include: { booking: { select: { id: true, userId: true, gym: { select: { name: true } } } } },
      });
      for (const payment of rows) {
        const type = payment.status === 'FAILED' ? NotificationType.PAYMENT_FAILED : payment.status === 'SUCCESS' ? NotificationType.PAYMENT_CONFIRMED : null;
        if (!type) continue;
        await createNotificationIntent(tx, { userId: payment.booking.userId, type, category: NotificationCategory.PAYMENT, title: type === NotificationType.PAYMENT_FAILED ? 'Payment failed' : 'Payment received', body: type === NotificationType.PAYMENT_FAILED ? `Payment for ${payment.booking.gym.name} did not complete.` : `Payment for ${payment.booking.gym.name} was confirmed.`, route: { screen: 'Booking', bookingId: payment.booking.id }, dedupeKey: `payment:${payment.id}:${type}` });
        await tx.notificationProjection.create({ data: { source: name, sourceId: payment.id } });
      }
      return rows.length;
    });
  }

  async projectRefundStatus(): Promise<number> {
    const name = 'refund-status';
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT r.id FROM refunds r
        WHERE r.status = 'SUCCESS'
          AND NOT EXISTS (SELECT 1 FROM notification_projections n WHERE n.source = ${name} AND n.source_id = r.id)
        ORDER BY r.updated_at ASC, r.id ASC LIMIT 100 FOR UPDATE OF r SKIP LOCKED
      `);
      const rows = await tx.refund.findMany({
        where: { id: { in: pending.map((item) => item.id) } },
        include: { payment: { select: { booking: { select: { id: true, userId: true, gym: { select: { name: true } } } } } } },
      });
      for (const refund of rows) {
        if (refund.status !== 'SUCCESS') continue;
        const booking = refund.payment.booking;
        await createNotificationIntent(tx, { userId: booking.userId, type: NotificationType.REFUND_COMPLETED, category: NotificationCategory.REFUND, title: 'Refund completed', body: `A refund for ${booking.gym.name} is complete.`, route: { screen: 'Booking', bookingId: booking.id }, dedupeKey: `refund:${refund.id}:success` });
        await tx.notificationProjection.create({ data: { source: name, sourceId: refund.id } });
      }
      return rows.length;
    });
  }

  async projectPaidSettlements(): Promise<number> {
    const name = 'settlement-paid';
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT s.id FROM settlements s
        WHERE s.status = 'PAID' AND s.paid_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM notification_projections n WHERE n.source = ${name} AND n.source_id = s.id)
        ORDER BY s.paid_at ASC, s.id ASC LIMIT 100 FOR UPDATE OF s SKIP LOCKED
      `);
      const rows = await tx.settlement.findMany({
        where: { id: { in: pending.map((item) => item.id) } },
      });
      for (const settlement of rows) {
        const gym = await tx.gym.findUniqueOrThrow({ where: { id: settlement.gymId }, select: { name: true, ownerId: true, memberships: { where: { status: 'ACTIVE', role: 'MANAGER' }, select: { userId: true } } } });
        for (const userId of new Set([gym.ownerId, ...gym.memberships.map((member) => member.userId)]))
          await createNotificationIntent(tx, { userId, type: NotificationType.SETTLEMENT_PAID, category: NotificationCategory.SETTLEMENT, title: 'Settlement recorded', body: `A settlement for ${gym.name} was marked paid.`, route: { screen: 'PartnerSettlement', settlementId: settlement.id }, dedupeKey: `settlement:${settlement.id}:paid:${userId}` });
        await tx.notificationProjection.create({ data: { source: name, sourceId: settlement.id } });
      }
      return rows.length;
    });
  }
}
