import { GymOsPaymentStatus, GymOsSubscriptionStatus } from '@prisma/client';
import { GymOsService } from './gym-os.service';

describe('GymOS Admin-controlled activation', () => {
  const subscription: {
    id: string; gymId: string; status: GymOsSubscriptionStatus;
    billingInterval: string; planNameSnapshot: string; trialEnd: Date | null;
    payment: { status: GymOsPaymentStatus } | null; gym: { ownerId: string };
  } = {
    id: 'subscription-a', gymId: 'gym-a', status: GymOsSubscriptionStatus.PENDING_PAYMENT,
    billingInterval: 'MONTHLY', planNameSnapshot: 'Growth', trialEnd: null,
    payment: { status: GymOsPaymentStatus.SUCCESS }, gym: { ownerId: 'owner-a' },
  };

  function subject(value = subscription) {
    const tx = {
      gymOsSubscription: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...value, status: GymOsSubscriptionStatus.ACTIVE }),
      },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'notification-a' }),
      },
      pushDevice: { findMany: jest.fn().mockResolvedValue([]) },
      pushDelivery: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      gymOsSubscription: { findUnique: jest.fn().mockResolvedValue(value) },
      $transaction: jest.fn(<T>(operation: (client: typeof tx) => Promise<T>) => operation(tx)),
    };
    return { service: new GymOsService(prisma as never, {} as never, {} as never, {} as never), tx };
  }

  it('allows Admin activation only after successful payment and audits it', async () => {
    const { service, tx } = subject();
    await expect(service.activateSubscription('admin-a', 'subscription-a')).resolves.toMatchObject({ status: 'ACTIVE' });
    expect(tx.gymOsSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'subscription-a', status: GymOsSubscriptionStatus.PENDING_PAYMENT },
      data: expect.objectContaining({ status: GymOsSubscriptionStatus.ACTIVE }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'admin-a', action: 'GYMOS_SUBSCRIPTION_ACTIVATED' }) });
  });

  it.each([GymOsPaymentStatus.CREATED, GymOsPaymentStatus.PENDING, GymOsPaymentStatus.FAILED, GymOsPaymentStatus.CANCELLED])(
    'rejects activation when payment is %s',
    async (status) => {
      const { service, tx } = subject({ ...subscription, payment: { status } });
      await expect(service.activateSubscription('admin-a', 'subscription-a')).rejects.toMatchObject({ status: 409 });
      expect(tx.gymOsSubscription.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    GymOsSubscriptionStatus.PAST_DUE,
    GymOsSubscriptionStatus.CANCELLED,
    GymOsSubscriptionStatus.EXPIRED,
    GymOsSubscriptionStatus.SUSPENDED,
  ])('does not reactivate the inactive %s state through the approval endpoint', async (status) => {
    const { service, tx } = subject({ ...subscription, status });
    await expect(service.activateSubscription('admin-a', 'subscription-a')).rejects.toMatchObject({ status: 409 });
    expect(tx.gymOsSubscription.updateMany).not.toHaveBeenCalled();
  });
});
