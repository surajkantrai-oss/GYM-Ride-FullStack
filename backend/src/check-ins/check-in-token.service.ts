import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingEventType, BookingStatus, CheckInMethod } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { PrismaService } from '../database/prisma.service';
import { CheckInService, checkInBookingInclude } from './check-in.service';

@Injectable()
export class CheckInTokenService {
  private readonly secret: string;
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkIns: CheckInService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('CHECK_IN_TOKEN_SECRET');
    this.ttlMs = config.get<number>('CHECK_IN_TOKEN_TTL_SECONDS', 180) * 1000;
  }

  async issue(userId: string, bookingId: string): Promise<unknown> {
    await this.checkIns.ensureOwnedEligibility(userId, bookingId);
    const value = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(value);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const issued = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: checkInBookingInclude,
      });
      if (!booking || !booking.checkIn || booking.userId !== userId)
        this.fail(ApiErrorCode.BOOKING_NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
      this.checkIns.assertCredentialEligibility(booking, userId, now);
      await tx.checkInToken.updateMany({
        where: { checkInId: booking.checkIn.id, consumedAt: null },
        data: { consumedAt: now },
      });
      const token = await tx.checkInToken.create({
        data: { checkInId: booking.checkIn.id, tokenHash, expiresAt },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId,
          type: BookingEventType.QR_TOKEN_ISSUED,
          fromStatus: BookingStatus.CHECK_IN_AVAILABLE,
          toStatus: BookingStatus.CHECK_IN_AVAILABLE,
          actorUserId: userId,
          metadata: { checkInId: booking.checkIn.id, expiresAt: expiresAt.toISOString() },
        },
      });
      return token;
    });
    return { token: value, expiresAt: issued.expiresAt };
  }

  async inspect(value: string): Promise<{ bookingId: string; branchId: string }> {
    const token = await this.prisma.checkInToken.findUnique({
      where: { tokenHash: this.hash(value) },
      select: { checkIn: { select: { bookingId: true, branchId: true } } },
    });
    if (!token)
      this.fail(
        ApiErrorCode.INVALID_CHECK_IN_TOKEN,
        'Invalid check-in token',
        HttpStatus.BAD_REQUEST,
      );
    return token.checkIn;
  }

  async verify(value: string, verifierId: string): Promise<string> {
    const tokenHash = this.hash(value);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const reference = await tx.checkInToken.findUnique({
        where: { tokenHash },
        select: { id: true, checkIn: { select: { bookingId: true } } },
      });
      if (!reference) this.fail(ApiErrorCode.INVALID_CHECK_IN_TOKEN, 'Invalid check-in token', 400);
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${reference.checkIn.bookingId}::uuid FOR UPDATE`;
      const token = await tx.checkInToken.findUnique({ where: { id: reference.id } });
      if (!token || !this.equalHash(token.tokenHash, tokenHash))
        this.fail(ApiErrorCode.INVALID_CHECK_IN_TOKEN, 'Invalid check-in token', 400);
      if (token.consumedAt)
        this.fail(
          ApiErrorCode.CHECK_IN_TOKEN_ALREADY_USED,
          'Check-in token has already been used',
          HttpStatus.CONFLICT,
        );
      if (token.expiresAt <= now)
        this.fail(ApiErrorCode.CHECK_IN_TOKEN_EXPIRED, 'Check-in token has expired', 400);
      const claimed = await tx.checkInToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1)
        this.fail(
          ApiErrorCode.CHECK_IN_TOKEN_ALREADY_USED,
          'Check-in token has already been used',
          HttpStatus.CONFLICT,
        );
      await this.checkIns.verifyInTransaction(
        tx,
        reference.checkIn.bookingId,
        token.checkInId,
        verifierId,
        CheckInMethod.QR,
        now,
      );
      return reference.checkIn.bookingId;
    });
  }

  private hash(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  private equalHash(left: string, right: string): boolean {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private fail(code: ApiErrorCode, message: string, status: number): never {
    throw new DomainException(code, message, status);
  }
}
