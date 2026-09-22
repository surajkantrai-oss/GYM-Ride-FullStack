import { ConfigService } from '@nestjs/config';
import { BookingStatus } from '@prisma/client';
import { ReservationExpirationService } from './reservation-expiration.service';

describe('ReservationExpirationService', () => {
  it('expires once, records an event, and is idempotent', async () => {
    const tx = {
      booking: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      bookingEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const config = new ConfigService({
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      BOOKING_QUEUE_ENABLED: false,
    });
    const service = new ReservationExpirationService(prisma as never, config);
    await expect(service.expire('booking')).resolves.toBe(true);
    await expect(service.expire('booking')).resolves.toBe(false);
    expect(tx.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: BookingStatus.PAYMENT_PENDING,
          reservationExpiresAt: { lte: expect.any(Date) },
        }),
      }),
    );
    expect(tx.bookingEvent.create).toHaveBeenCalledTimes(1);
  });
});
