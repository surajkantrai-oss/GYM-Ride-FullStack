import { BookingStatus } from '@prisma/client';

const transitions: Partial<Record<BookingStatus, BookingStatus[]>> = {
  CREATED: [BookingStatus.PAYMENT_PENDING],
  PAYMENT_PENDING: [
    BookingStatus.CONFIRMED,
    BookingStatus.EXPIRED,
    BookingStatus.PAYMENT_FAILED,
    BookingStatus.CANCELLED,
    BookingStatus.REFUNDED,
  ],
  CONFIRMED: [BookingStatus.CANCELLED, BookingStatus.CHECK_IN_AVAILABLE, BookingStatus.REFUNDED],
  CANCELLED: [BookingStatus.REFUNDED],
  EXPIRED: [BookingStatus.REFUNDED],
  CHECK_IN_AVAILABLE: [BookingStatus.CHECKED_IN, BookingStatus.NO_SHOW],
  CHECKED_IN: [BookingStatus.COMPLETED],
  PAYMENT_FAILED: [BookingStatus.REFUNDED],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}
