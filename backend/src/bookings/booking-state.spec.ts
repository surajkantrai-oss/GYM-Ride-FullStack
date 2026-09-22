import { BookingStatus } from '@prisma/client';
import { canTransitionBooking } from './booking-state';

describe('booking state machine', () => {
  it('allows lifecycle transitions and rejects terminal resurrection', () => {
    expect(canTransitionBooking(BookingStatus.CREATED, BookingStatus.PAYMENT_PENDING)).toBe(true);
    expect(canTransitionBooking(BookingStatus.PAYMENT_PENDING, BookingStatus.EXPIRED)).toBe(true);
    expect(canTransitionBooking(BookingStatus.EXPIRED, BookingStatus.CONFIRMED)).toBe(false);
    expect(canTransitionBooking(BookingStatus.CANCELLED, BookingStatus.PAYMENT_PENDING)).toBe(
      false,
    );
  });
});
