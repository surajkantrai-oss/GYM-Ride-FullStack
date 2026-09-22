import { Module } from '@nestjs/common';
import {
  AdminBookingsController,
  CustomerBookingsController,
  PartnerBookingsController,
} from './bookings.controller';
import { BookingLockService } from './booking-lock.service';
import { BookingsService } from './bookings.service';
import { ReservationExpirationService } from './reservation-expiration.service';
import { CheckInsModule } from '../check-ins/check-ins.module';
@Module({
  imports: [CheckInsModule],
  controllers: [CustomerBookingsController, PartnerBookingsController, AdminBookingsController],
  providers: [BookingLockService, BookingsService, ReservationExpirationService],
  exports: [BookingsService, ReservationExpirationService],
})
export class BookingsModule {}
