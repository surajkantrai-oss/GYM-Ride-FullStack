import { PushDeliveryStatus } from '@prisma/client';
import { NotificationDeliveryService } from './notification-delivery.service';

describe('NotificationDeliveryService', () => {
  const delivery = {
    id: 'delivery-a', notificationId: 'notification-a', deviceId: 'device-a', attempts: 1,
    notification: { userId: 'user-a', category: 'BOOKING', title: 'Booked', body: 'Booking confirmed', data: { screen: 'Booking', bookingId: 'booking-a' } },
    device: { id: 'device-a', userId: 'user-a', enabled: true, token: 'ExpoPushToken[abcdefghijklmno]' },
  };
  const make = () => {
    const db = {
      pushDelivery: {
        findMany: jest.fn().mockResolvedValue([{ id: delivery.id }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(delivery),
        update: jest.fn().mockResolvedValue({}),
      },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      pushDevice: { update: jest.fn().mockResolvedValue({}) },
    };
    const provider = { name: 'test', send: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerMessageId: 'ticket-a' }) };
    return { db, provider, service: new NotificationDeliveryService(db as never, provider) };
  };

  it('claims one pending row before sending and stores the provider ticket', async () => {
    const { db, provider, service } = make();
    await expect(service.deliverDue()).resolves.toBe(1);
    expect(db.pushDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: delivery.id }), data: { status: PushDeliveryStatus.PROCESSING, attempts: { increment: 1 } } }));
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ token: delivery.device.token, data: delivery.notification.data }));
    expect(db.pushDelivery.update).toHaveBeenCalledWith({ where: { id: delivery.id }, data: expect.objectContaining({ status: PushDeliveryStatus.SENT, providerMessageId: 'ticket-a' }) });
  });

  it('does not deliver a row claimed by another worker', async () => {
    const { db, provider, service } = make();
    db.pushDelivery.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.deliverDue()).resolves.toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('skips disabled or reassigned devices and opted-out push', async () => {
    const { db, provider, service } = make();
    db.pushDelivery.findUniqueOrThrow.mockResolvedValue({ ...delivery, device: { ...delivery.device, userId: 'user-b' } });
    await service.deliverDue();
    expect(provider.send).not.toHaveBeenCalled();
    expect(db.pushDelivery.update).toHaveBeenCalledWith({ where: { id: delivery.id }, data: { status: PushDeliveryStatus.SKIPPED, failureCode: 'DEVICE_OR_PREFERENCE_DISABLED' } });
    db.notificationPreference.findUnique.mockResolvedValue({ pushEnabled: false });
    db.pushDelivery.findUniqueOrThrow.mockResolvedValue(delivery);
    await service.deliverDue();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('backs off transient failures and bounds retries', async () => {
    const { db, provider, service } = make();
    provider.send.mockResolvedValue({ status: 'FAILED', code: 'NETWORK', permanent: false, invalidateToken: false });
    await service.deliverDue();
    expect(db.pushDelivery.update).toHaveBeenCalledWith({ where: { id: delivery.id }, data: expect.objectContaining({ status: PushDeliveryStatus.PENDING, failureCode: 'NETWORK', nextAttemptAt: expect.any(Date) }) });
    db.pushDelivery.findUniqueOrThrow.mockResolvedValue({ ...delivery, attempts: 5 });
    await service.deliverDue();
    expect(db.pushDelivery.update).toHaveBeenLastCalledWith({ where: { id: delivery.id }, data: expect.objectContaining({ status: PushDeliveryStatus.FAILED }) });
  });

  it('invalidates an unusable token after a permanent provider response', async () => {
    const { db, provider, service } = make();
    provider.send.mockResolvedValue({ status: 'FAILED', code: 'DeviceNotRegistered', permanent: true, invalidateToken: true });
    await service.deliverDue();
    expect(db.pushDevice.update).toHaveBeenCalledWith({ where: { id: delivery.deviceId }, data: { enabled: false } });
    expect(db.pushDelivery.update).toHaveBeenCalledWith({ where: { id: delivery.id }, data: expect.objectContaining({ status: PushDeliveryStatus.FAILED }) });
  });
});
