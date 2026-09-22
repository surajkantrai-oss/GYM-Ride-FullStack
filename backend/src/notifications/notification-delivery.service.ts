import { Injectable, Logger } from '@nestjs/common';
import { PushDeliveryStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PushProvider } from './providers/push-provider';

const maxAttempts = 5;

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);
  constructor(private readonly prisma: PrismaService, private readonly provider: PushProvider) {}

  async deliverDue(limit = 100): Promise<number> {
    const now = new Date();
    const stale = new Date(now.getTime() - 5 * 60_000);
    const candidates = await this.prisma.pushDelivery.findMany({
      where: { OR: [
        { status: PushDeliveryStatus.PENDING, nextAttemptAt: { lte: now } },
        { status: PushDeliveryStatus.PROCESSING, updatedAt: { lt: stale } },
      ] },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let processed = 0;
    for (const { id } of candidates) {
      const claimed = await this.prisma.pushDelivery.updateMany({
        where: { id, OR: [
          { status: PushDeliveryStatus.PENDING, nextAttemptAt: { lte: now } },
          { status: PushDeliveryStatus.PROCESSING, updatedAt: { lt: stale } },
        ] },
        data: { status: PushDeliveryStatus.PROCESSING, attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      const delivery = await this.prisma.pushDelivery.findUniqueOrThrow({
        where: { id },
        include: { notification: true, device: true },
      });
      const preference = await this.prisma.notificationPreference.findUnique({
        where: { userId_category: { userId: delivery.notification.userId, category: delivery.notification.category } },
      });
      if (!delivery.device.enabled || preference?.pushEnabled === false || delivery.device.userId !== delivery.notification.userId) {
        await this.prisma.pushDelivery.update({ where: { id }, data: { status: PushDeliveryStatus.SKIPPED, failureCode: 'DEVICE_OR_PREFERENCE_DISABLED' } });
        processed++;
        continue;
      }
      const result = await this.provider.send({
        token: delivery.device.token,
        title: delivery.notification.title,
        body: delivery.notification.body,
        data: delivery.notification.data && typeof delivery.notification.data === 'object' && !Array.isArray(delivery.notification.data) ? delivery.notification.data : {},
      });
      if (result.status === 'ACCEPTED') {
        await this.prisma.pushDelivery.update({ where: { id }, data: { status: PushDeliveryStatus.SENT, providerMessageId: result.providerMessageId, sentAt: new Date(), failureCode: null } });
      } else if (result.status === 'SKIPPED') {
        await this.prisma.pushDelivery.update({ where: { id }, data: { status: PushDeliveryStatus.SKIPPED, failureCode: result.code } });
      } else {
        const terminal = result.permanent || delivery.attempts >= maxAttempts;
        await this.prisma.pushDelivery.update({ where: { id }, data: {
          status: terminal ? PushDeliveryStatus.FAILED : PushDeliveryStatus.PENDING,
          failureCode: result.code,
          nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 1000 * 2 ** delivery.attempts)),
        } });
        if (result.invalidateToken) await this.prisma.pushDevice.update({ where: { id: delivery.deviceId }, data: { enabled: false } });
        this.logger.warn({ deliveryId: id, notificationId: delivery.notificationId, provider: this.provider.name, code: result.code, terminal }, 'Push delivery failed');
      }
      processed++;
    }
    return processed;
  }
}
