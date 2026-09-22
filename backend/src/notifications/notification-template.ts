import { BookingEventType, BookingStatus, NotificationCategory, NotificationType } from '@prisma/client';
import { NotificationIntent } from './notification-intent';

export interface BookingEventForNotification {
  id: string;
  type: BookingEventType;
  toStatus: BookingStatus;
  booking: { id: string; userId: string; gymId: string; gym: { name: string } };
}

export function bookingNotificationIntents(event: BookingEventForNotification): NotificationIntent[] {
  const { booking } = event;
  const base = { userId: booking.userId, dedupeKey: `booking-event:${event.id}:${booking.userId}` };
  const route = { screen: 'Booking' as const, bookingId: booking.id };
  if (event.type === BookingEventType.BOOKING_CREATED)
    return [{ ...base, type: NotificationType.BOOKING_CREATED, category: NotificationCategory.BOOKING, title: 'Reservation created', body: `Complete payment to reserve your workout at ${booking.gym.name}.`, route }];
  if (event.toStatus === BookingStatus.CONFIRMED)
    return [{ ...base, type: NotificationType.BOOKING_CONFIRMED, category: NotificationCategory.BOOKING, title: 'Booking confirmed', body: `Your workout at ${booking.gym.name} is confirmed.`, route }];
  if (event.type === BookingEventType.CHECK_IN_AVAILABLE)
    return [{ ...base, type: NotificationType.CHECK_IN_AVAILABLE, category: NotificationCategory.CHECK_IN, title: 'Check-in is open', body: `Your check-in window at ${booking.gym.name} is open.`, route: { screen: 'CheckIn', bookingId: booking.id } }];
  if (event.toStatus === BookingStatus.CHECKED_IN)
    return [{ ...base, type: NotificationType.CHECKED_IN, category: NotificationCategory.CHECK_IN, title: 'Checked in', body: `You are checked in at ${booking.gym.name}.`, route }];
  if (event.type === BookingEventType.BOOKING_COMPLETED)
    return [{ ...base, type: NotificationType.REVIEW_AVAILABLE, category: NotificationCategory.REVIEW, title: 'How was your workout?', body: `Your visit to ${booking.gym.name} is complete. Leave a review.`, route: { screen: 'BookingReview', bookingId: booking.id } }];
  if (event.type === BookingEventType.BOOKING_NO_SHOW)
    return [{ ...base, type: NotificationType.BOOKING_NO_SHOW, category: NotificationCategory.CHECK_IN, title: 'Check-in window missed', body: `Your booking at ${booking.gym.name} was marked no-show.`, route }];
  if (event.toStatus === BookingStatus.CANCELLED)
    return [{ ...base, type: NotificationType.BOOKING_CANCELLED, category: NotificationCategory.BOOKING, title: 'Booking cancelled', body: `Your booking at ${booking.gym.name} was cancelled.`, route }];
  return [];
}
