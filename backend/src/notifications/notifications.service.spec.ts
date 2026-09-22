import { NotificationCategory } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService privacy, preferences, and device lifecycle', () => {
  const owner = 'user-a';
  const session = 'session-a';
  const device = { id: 'device-a', userId: owner, platform: 'ios', provider: 'expo', enabled: true };
  const make = () => {
    const db = {
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue({ id: 'notice-a' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'notice-a', readAt: new Date() }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ category: NotificationCategory.BOOKING, inAppEnabled: true, pushEnabled: false }),
      },
      pushDevice: {
        findFirst: jest.fn().mockResolvedValue({ id: device.id }),
        upsert: jest.fn().mockResolvedValue(device),
        update: jest.fn().mockResolvedValue(device),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const projection = { catchUp: jest.fn().mockResolvedValue(0) };
    return { db, projection, service: new NotificationsService(db as never, projection as never) };
  };

  it('scopes list and unread count to the authenticated user', async () => {
    const { db, projection, service } = make();
    await service.list(owner, { page: 1, limit: 20, unread: true });
    expect(projection.catchUp).toHaveBeenCalled();
    expect(db.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: owner, readAt: null } }));
    await expect(service.unreadCount(owner)).resolves.toEqual({ count: 1 });
    expect(db.notification.count).toHaveBeenLastCalledWith({ where: { userId: owner, readAt: null } });
  });

  it('does not mark another user’s notification read', async () => {
    const { db, service } = make();
    db.notification.findFirst.mockResolvedValue(null);
    await expect(service.read('user-b', 'notice-a')).rejects.toMatchObject({ status: 404 });
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it('marks one or all owned notifications read idempotently', async () => {
    const { db, service } = make();
    await service.read(owner, 'notice-a');
    expect(db.notification.updateMany).toHaveBeenCalledWith({ where: { id: 'notice-a', userId: owner, readAt: null }, data: { readAt: expect.any(Date) } });
    await expect(service.readAll(owner)).resolves.toEqual({ updated: 1 });
    expect(db.notification.updateMany).toHaveBeenLastCalledWith({ where: { userId: owner, readAt: null }, data: { readAt: expect.any(Date) } });
  });

  it('defaults marketing consent off and preserves transactional in-app messages', async () => {
    const { db, service } = make();
    const preferences = await service.preferences(owner) as { category: NotificationCategory; inAppEnabled: boolean; pushEnabled: boolean }[];
    expect(preferences.find((item) => item.category === NotificationCategory.MARKETING)).toEqual({ category: NotificationCategory.MARKETING, inAppEnabled: false, pushEnabled: false });
    await expect(service.updatePreference(owner, { category: NotificationCategory.BOOKING, inAppEnabled: false })).rejects.toMatchObject({ status: 400 });
    await service.updatePreference(owner, { category: NotificationCategory.BOOKING, pushEnabled: false });
    expect(db.notificationPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_category: { userId: owner, category: NotificationCategory.BOOKING } } }));
  });

  it('binds a registered or rotated token to the authenticated session without returning the token', async () => {
    const { db, service } = make();
    const input = { platform: 'ios', token: 'ExpoPushToken[abcdefghijklmno]' };
    await expect(service.registerDevice(owner, session, input)).resolves.toEqual({ id: device.id, platform: 'ios', provider: 'expo', enabled: true });
    expect(db.pushDevice.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ userId: owner, sessionId: session, token: input.token }) }));
    await service.registerDevice(owner, session, { ...input, deviceId: device.id });
    expect(db.pushDevice.findFirst).toHaveBeenCalledWith({ where: { id: device.id, userId: owner }, select: { id: true } });
    expect(db.pushDevice.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: device.id }, data: expect.objectContaining({ sessionId: session }) }));
  });

  it('rejects another user’s device rotation or deregistration', async () => {
    const { db, service } = make();
    db.pushDevice.findFirst.mockResolvedValue(null);
    await expect(service.registerDevice('user-b', 'session-b', { platform: 'ios', token: 'ExpoPushToken[abcdefghijklmno]', deviceId: device.id })).rejects.toMatchObject({ status: 404 });
    db.pushDevice.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.unregisterDevice('user-b', device.id)).rejects.toMatchObject({ status: 404 });
  });
});
