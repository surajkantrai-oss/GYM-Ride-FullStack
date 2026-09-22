import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { canTransitionBooking } from '../bookings/booking-state';

export function financeError(code: ApiErrorCode, message: string, status = 409): never {
  throw new DomainException(code, message, status);
}

const transitions: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
  CREATED: ['PENDING'],
  PENDING: ['AUTHORIZED', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED'],
  AUTHORIZED: ['SUCCESS', 'FAILED', 'EXPIRED'],
  FAILED: ['SUCCESS'],
  EXPIRED: ['SUCCESS'],
  CANCELLED: ['SUCCESS'],
  SUCCESS: ['REFUND_PENDING'],
  REFUND_PENDING: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUND_PENDING'],
};
export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (from !== to && !transitions[from]?.includes(to))
    financeError(
      ApiErrorCode.INVALID_PAYMENT_STATE,
      `Cannot transition payment from ${from} to ${to}`,
    );
}

export function proportional(amount: number, numerator: number, denominator: number): number {
  if (
    ![amount, numerator, denominator].every(Number.isSafeInteger) ||
    amount < 0 ||
    numerator < 0 ||
    denominator <= 0
  )
    throw new Error('Invalid monetary calculation');
  return Number(
    (BigInt(amount) * BigInt(numerator) + BigInt(Math.floor(denominator / 2))) /
      BigInt(denominator),
  );
}

@Injectable()
export class CommissionService {
  constructor(private readonly config: ConfigService) {}
  calculate(amount: number): {
    commissionAmount: number;
    commissionBps: number;
    commissionVersion: string;
    netAmount: number;
  } {
    const bps = this.config.get<number>('DEFAULT_PLATFORM_COMMISSION_BPS', 1500);
    const commissionAmount = proportional(amount, bps, 10000);
    return {
      commissionAmount,
      commissionBps: bps,
      commissionVersion: 'default-v1',
      netAmount: amount - commissionAmount,
    };
  }
}

@Injectable()
export class RefundPolicy {
  constructor(private readonly config: ConfigService) {}
  assertAllowed(status: BookingStatus, slotStart: Date | null, override: boolean): void {
    if (!canTransitionBooking(status, BookingStatus.REFUNDED))
      financeError(ApiErrorCode.REFUND_NOT_ALLOWED, 'Booking state cannot be refunded');
    if (override) return;
    if (
      !(['CONFIRMED', 'CANCELLED', 'EXPIRED', 'PAYMENT_PENDING'] as BookingStatus[]).includes(
        status,
      )
    )
      financeError(ApiErrorCode.REFUND_NOT_ALLOWED, 'Booking is outside the refund policy');
    const minimum = this.config.get<number>('REFUND_MINIMUM_HOURS', 2) * 3600000;
    if (slotStart && slotStart.getTime() - Date.now() < minimum)
      financeError(ApiErrorCode.REFUND_NOT_ALLOWED, 'Refund window has closed');
  }
}
