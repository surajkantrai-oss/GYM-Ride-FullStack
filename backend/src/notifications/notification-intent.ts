import { NotificationCategory, NotificationType, Prisma } from '@prisma/client';

export type NotificationRoute =
  | { screen: 'Booking'; bookingId: string }
  | { screen: 'CheckIn'; bookingId: string }
  | { screen: 'BookingReview'; bookingId: string }
  | { screen: 'Gym'; gymId: string }
  | { screen: 'Flex' }
  | { screen: 'PartnerReviews'; gymId: string }
  | { screen: 'PartnerSettlement'; settlementId: string };

export interface NotificationIntent {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  route: NotificationRoute;
  dedupeKey: string;
}

/** Only persisted intent and delivery rows are created here; no provider I/O occurs in a domain transaction. */
export async function createNotificationIntent(
  tx: Prisma.TransactionClient,
  intent: NotificationIntent,
): Promise<string | null> {
  const preference = await tx.notificationPreference.findUnique({
    where: { userId_category: { userId: intent.userId, category: intent.category } },
  });
  if (intent.category === NotificationCategory.MARKETING && !preference?.inAppEnabled) return null;
  await tx.notification.createMany({
    data: [{
      userId: intent.userId,
      type: intent.type,
      category: intent.category,
      title: intent.title,
      body: intent.body,
      data: intent.route,
      dedupeKey: intent.dedupeKey,
    }],
    skipDuplicates: true,
  });
  const notification = await tx.notification.findUniqueOrThrow({
    where: { dedupeKey: intent.dedupeKey },
    select: { id: true },
  });
  if (preference?.pushEnabled !== false && intent.category !== NotificationCategory.MARKETING) {
    const devices = await tx.pushDevice.findMany({
      where: { userId: intent.userId, enabled: true },
      select: { id: true },
    });
    if (devices.length)
      await tx.pushDelivery.createMany({
        data: devices.map(({ id }) => ({ notificationId: notification.id, deviceId: id })),
        skipDuplicates: true,
      });
  }
  return notification.id;
}
