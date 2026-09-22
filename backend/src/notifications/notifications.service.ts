import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationCategory, Prisma } from '@prisma/client';
import { ApiErrorCode as E } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { pageMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { NotificationProjectionService } from './notification-projection.service';
import { NotificationListDto, NotificationPreferenceDto, RegisterPushDeviceDto } from './notifications.dto';

const categories = Object.values(NotificationCategory);

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly projection: NotificationProjectionService) {}

  async list(userId: string, query: NotificationListDto): Promise<unknown> {
    await this.projection.catchUp();
    const where: Prisma.NotificationWhereInput = { userId, ...(query.unread && { readAt: null }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, select: { id: true, type: true, category: true, title: true, body: true, data: true, readAt: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, meta: pageMeta(query.page, query.limit, total) };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    await this.projection.catchUp();
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async read(userId: string, id: string): Promise<unknown> {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
    if (!notification) this.fail(E.NOTIFICATION_NOT_FOUND, 'Notification not found', HttpStatus.NOT_FOUND);
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return this.prisma.notification.findUniqueOrThrow({ where: { id }, select: { id: true, readAt: true } });
  }

  async readAll(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }

  async preferences(userId: string): Promise<unknown> {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    return categories.map((category) => {
      const row = rows.find((item) => item.category === category);
      return { category, inAppEnabled: category === NotificationCategory.MARKETING ? row?.inAppEnabled ?? false : true, pushEnabled: row?.pushEnabled ?? (category !== NotificationCategory.MARKETING) };
    });
  }

  async updatePreference(userId: string, input: NotificationPreferenceDto): Promise<unknown> {
    if (input.category !== NotificationCategory.MARKETING && input.inAppEnabled === false)
      this.fail(E.NOTIFICATION_PREFERENCE_INVALID, 'Transactional in-app updates cannot be disabled', HttpStatus.BAD_REQUEST);
    if (input.inAppEnabled === undefined && input.pushEnabled === undefined)
      this.fail(E.NOTIFICATION_PREFERENCE_INVALID, 'At least one preference is required', HttpStatus.BAD_REQUEST);
    const defaultInApp = input.category !== NotificationCategory.MARKETING;
    const defaultPush = input.category !== NotificationCategory.MARKETING;
    return this.prisma.notificationPreference.upsert({
      where: { userId_category: { userId, category: input.category } },
      create: { userId, category: input.category, inAppEnabled: input.inAppEnabled ?? defaultInApp, pushEnabled: input.pushEnabled ?? defaultPush },
      update: { ...(input.inAppEnabled !== undefined && { inAppEnabled: input.inAppEnabled }), ...(input.pushEnabled !== undefined && { pushEnabled: input.pushEnabled }) },
      select: { category: true, inAppEnabled: true, pushEnabled: true },
    });
  }

  async registerDevice(userId: string, sessionId: string, input: RegisterPushDeviceDto): Promise<unknown> {
    if (input.deviceId) {
      const own = await this.prisma.pushDevice.findFirst({ where: { id: input.deviceId, userId }, select: { id: true } });
      if (!own) this.fail(E.DEVICE_TOKEN_INVALID, 'Device not found', HttpStatus.NOT_FOUND);
    }
    const data = { userId, sessionId, platform: input.platform, provider: 'expo', token: input.token, appVersion: input.appVersion, deviceName: input.deviceName, enabled: true, lastSeenAt: new Date() };
    try {
      const device = input.deviceId
        ? await this.prisma.pushDevice.update({ where: { id: input.deviceId }, data })
        : await this.prisma.pushDevice.upsert({ where: { provider_token: { provider: 'expo', token: input.token } }, create: data, update: data });
      return { id: device.id, platform: device.platform, provider: device.provider, enabled: device.enabled };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        this.fail(E.DEVICE_TOKEN_INVALID, 'Token is already registered on another device', HttpStatus.CONFLICT);
      throw error;
    }
  }

  async unregisterDevice(userId: string, id: string): Promise<{ disabled: boolean }> {
    const result = await this.prisma.pushDevice.updateMany({ where: { id, userId }, data: { enabled: false } });
    if (!result.count) this.fail(E.DEVICE_TOKEN_INVALID, 'Device not found', HttpStatus.NOT_FOUND);
    return { disabled: true };
  }

  private fail(code: E, message: string, status: HttpStatus): never {
    throw new DomainException(code, message, status);
  }
}
