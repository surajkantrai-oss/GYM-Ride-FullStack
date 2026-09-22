import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingEventType, BookingStatus, CheckInMethod } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { PrismaService } from '../database/prisma.service';
import { CheckInService, checkInBookingInclude } from './check-in.service';

interface OtpFailure {
  code: ApiErrorCode;
  message: string;
  status: number;
}

@Injectable()
export class CheckInOtpService {
  private readonly secret: string;
  private readonly ttlMs: number;
  private readonly maxAttempts: number;
  private readonly cooldownMs: number;
  private readonly requestLimit: number;
  private readonly requestWindowMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkIns: CheckInService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('CHECK_IN_TOKEN_SECRET');
    this.ttlMs = config.get<number>('CHECK_IN_OTP_TTL_SECONDS', 180) * 1000;
    this.maxAttempts = config.get<number>('CHECK_IN_OTP_MAX_ATTEMPTS', 5);
    this.cooldownMs = config.get<number>('CHECK_IN_OTP_RESEND_COOLDOWN_SECONDS', 30) * 1000;
    this.requestLimit = config.get<number>('CHECK_IN_OTP_REQUEST_LIMIT', 5);
    this.requestWindowMs = config.get<number>('CHECK_IN_OTP_REQUEST_WINDOW_SECONDS', 3600) * 1000;
  }

  async issue(userId: string, bookingId: string): Promise<unknown> {
    await this.checkIns.ensureOwnedEligibility(userId, bookingId);
    const now = new Date();
    const code = randomInt(100000, 1000000).toString();
    const challengeId = randomUUID();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: checkInBookingInclude,
      });
      if (!booking || !booking.checkIn || booking.userId !== userId)
        this.fail(ApiErrorCode.BOOKING_NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
      this.checkIns.assertCredentialEligibility(booking, userId, now);
      const since = new Date(now.getTime() - this.requestWindowMs);
      const [count, latest] = await Promise.all([
        tx.checkInOtpChallenge.count({
          where: { checkInId: booking.checkIn.id, createdAt: { gte: since } },
        }),
        tx.checkInOtpChallenge.findFirst({
          where: { checkInId: booking.checkIn.id },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      if (count >= this.requestLimit)
        this.fail(
          ApiErrorCode.CHECK_IN_OTP_RATE_LIMITED,
          'Too many check-in OTP requests',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      if (latest && now.getTime() - latest.createdAt.getTime() < this.cooldownMs)
        this.fail(
          ApiErrorCode.CHECK_IN_OTP_RATE_LIMITED,
          'Wait before requesting another check-in OTP',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      await tx.checkInOtpChallenge.updateMany({
        where: { checkInId: booking.checkIn.id, consumedAt: null },
        data: { consumedAt: now },
      });
      const challenge = await tx.checkInOtpChallenge.create({
        data: {
          id: challengeId,
          checkInId: booking.checkIn.id,
          codeHash: this.hash(challengeId, bookingId, code),
          expiresAt,
          maxAttempts: this.maxAttempts,
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId,
          type: BookingEventType.CHECK_IN_OTP_ISSUED,
          fromStatus: BookingStatus.CHECK_IN_AVAILABLE,
          toStatus: BookingStatus.CHECK_IN_AVAILABLE,
          actorUserId: userId,
          metadata: { checkInId: booking.checkIn.id, expiresAt: expiresAt.toISOString() },
        },
      });
      return challenge;
    });
    // This is an authenticated in-app fallback. No server log or persistent plaintext copy exists.
    return { bookingId, code, expiresAt: result.expiresAt };
  }

  async inspect(bookingId: string): Promise<{ bookingId: string; branchId: string }> {
    const checkIn = await this.prisma.checkIn.findUnique({
      where: { bookingId },
      select: { bookingId: true, branchId: true },
    });
    if (!checkIn)
      this.fail(ApiErrorCode.INVALID_CHECK_IN_OTP, 'Invalid check-in OTP', HttpStatus.BAD_REQUEST);
    return checkIn;
  }

  async verify(bookingId: string, code: string, verifierId: string): Promise<string> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      const challenge = await tx.checkInOtpChallenge.findFirst({
        where: { checkIn: { bookingId } },
        orderBy: { createdAt: 'desc' },
      });
      if (!challenge)
        return this.failure(ApiErrorCode.INVALID_CHECK_IN_OTP, 'Invalid check-in OTP', 400);
      if (challenge.consumedAt)
        return this.failure(ApiErrorCode.INVALID_CHECK_IN_OTP, 'Invalid check-in OTP', 400);
      if (challenge.expiresAt <= now) {
        await tx.checkInOtpChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: now },
        });
        return this.failure(ApiErrorCode.CHECK_IN_OTP_EXPIRED, 'Check-in OTP has expired', 400);
      }
      if (challenge.attempts >= challenge.maxAttempts)
        return this.failure(
          ApiErrorCode.CHECK_IN_OTP_ATTEMPTS_EXCEEDED,
          'Check-in OTP attempt limit exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      const expected = this.hash(challenge.id, bookingId, code);
      if (!this.equalHash(challenge.codeHash, expected)) {
        const attempts = challenge.attempts + 1;
        await tx.checkInOtpChallenge.update({
          where: { id: challenge.id },
          data: { attempts, ...(attempts >= challenge.maxAttempts && { consumedAt: now }) },
        });
        return this.failure(
          attempts >= challenge.maxAttempts
            ? ApiErrorCode.CHECK_IN_OTP_ATTEMPTS_EXCEEDED
            : ApiErrorCode.INVALID_CHECK_IN_OTP,
          attempts >= challenge.maxAttempts
            ? 'Check-in OTP attempt limit exceeded'
            : 'Invalid check-in OTP',
          attempts >= challenge.maxAttempts ? HttpStatus.TOO_MANY_REQUESTS : 400,
        );
      }
      await tx.checkInOtpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      await this.checkIns.verifyInTransaction(
        tx,
        bookingId,
        challenge.checkInId,
        verifierId,
        CheckInMethod.OTP,
        now,
      );
      return { bookingId };
    });
    if ('code' in result) throw new DomainException(result.code, result.message, result.status);
    return result.bookingId;
  }

  private hash(challengeId: string, bookingId: string, code: string): string {
    return createHmac('sha256', this.secret)
      .update(`${challengeId}:${bookingId}:${code}`)
      .digest('hex');
  }

  private equalHash(left: string, right: string): boolean {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private failure(code: ApiErrorCode, message: string, status: number): OtpFailure {
    return { code, message, status };
  }

  private fail(code: ApiErrorCode, message: string, status: number): never {
    throw new DomainException(code, message, status);
  }
}
