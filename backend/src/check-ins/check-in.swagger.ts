import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { BookingStatus, CheckInMethod, CheckInStatus } from '@prisma/client';

const id: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const nullableDate: SchemaObject = { ...date, nullable: true };
const nullableText: SchemaObject = { type: 'string', nullable: true };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  properties,
});
const checkIn = object({
  id,
  status: { type: 'string', enum: Object.values(CheckInStatus) },
  method: { type: 'string', enum: Object.values(CheckInMethod), nullable: true },
  verifiedAt: nullableDate,
  completedAt: nullableDate,
});
export const checkInStatusSchema = object({
  bookingId: id,
  bookingStatus: { type: 'string', enum: Object.values(BookingStatus) },
  eligible: { type: 'boolean' },
  planName: { type: 'string' },
  gym: object({ id, name: { type: 'string' } }),
  branch: object({
    id,
    name: { type: 'string' },
    city: { type: 'string' },
    timezone: { type: 'string' },
  }),
  slot: {
    ...object({ id, startAt: date, endAt: date }),
    nullable: true,
  },
  window: {
    ...object({ opensAt: date, closesAt: date, completesAt: date, noShowAt: date }),
    nullable: true,
  },
  checkIn: { ...checkIn, nullable: true },
});
export const qrCredentialSchema = object({
  token: {
    type: 'string',
    description: 'Short-lived opaque single-use token. It contains no PII or payment data.',
  },
  expiresAt: date,
});
export const otpCredentialSchema = object({
  bookingId: id,
  code: {
    type: 'string',
    pattern: '^\\d{6}$',
    description: 'Short-lived in-app fallback code; never persisted in plaintext.',
  },
  expiresAt: date,
});
export const verificationSchema = object({
  id,
  status: { type: 'string', enum: Object.values(BookingStatus) },
  planName: { type: 'string' },
  user: object({ id, firstName: nullableText, lastName: nullableText }),
  gym: object({ id, name: { type: 'string' } }),
  branch: object({ id, name: { type: 'string' }, city: { type: 'string' } }),
  slot: { ...object({ startAt: date, endAt: date }), nullable: true },
  checkIn: { ...checkIn, nullable: true },
});

export function CheckInErrors(): ClassDecorator {
  const schema = object({
    success: { type: 'boolean', enum: [false] },
    error: object({ code: { type: 'string' }, message: { type: 'string' } }),
    requestId: { type: 'string' },
  });
  return applyDecorators(
    ...[
      [400, 'Invalid, expired or malformed QR/OTP credential'],
      [401, 'Missing or expired bearer session'],
      [403, 'Role or branch authorization failed'],
      [404, 'Owned booking/check-in was not found'],
      [409, 'Window/state conflict, replay, or already checked in'],
      [429, 'OTP cooldown, request limit, or attempt limit exceeded'],
    ].map(([status, description]) =>
      ApiResponse({ status: Number(status), description: String(description), schema }),
    ),
  );
}
