import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { PaymentStatus, RefundStatus, SettlementStatus } from '@prisma/client';

const id: SchemaObject = { type: 'string', format: 'uuid' };
const money: SchemaObject = {
  type: 'integer',
  description: 'Integer minor units: 49900 paise = INR 499.00',
  example: 49900,
};
const date: SchemaObject = { type: 'string', format: 'date-time' };
const currency: SchemaObject = { type: 'string', enum: ['INR'] };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  properties,
});
export const paymentSchema = object({
  id,
  bookingId: id,
  provider: { type: 'string', enum: ['development', 'razorpay'] },
  orderId: { type: 'string', nullable: true },
  providerOrderId: { type: 'string', nullable: true },
  amount: money,
  currency,
  status: { type: 'string', enum: Object.values(PaymentStatus) },
  refundedAmount: money,
  capturedAt: date,
  createdAt: date,
  simulated: { type: 'boolean' },
  keyId: { type: 'string', description: 'Publishable Razorpay checkout key only' },
});
export const refundSchema = object({
  id,
  paymentId: id,
  amount: money,
  reason: { type: 'string' },
  status: { type: 'string', enum: Object.values(RefundStatus) },
  providerRefundId: { type: 'string', nullable: true },
  createdAt: date,
  updatedAt: date,
  reconciliationRequired: { type: 'boolean' },
});
export const earningSchema = object({
  id,
  paymentId: id,
  grossAmount: money,
  taxAmount: money,
  discountAmount: money,
  commissionAmount: money,
  commissionBps: { type: 'integer', minimum: 0, maximum: 10000 },
  commissionVersion: { type: 'string' },
  refundAmount: money,
  commissionReversed: money,
  netAmount: money,
  currency,
  settled: { type: 'boolean' },
  createdAt: date,
});
export const reversalSchema = object({
  id,
  settlementId: id,
  originalLedgerId: id,
  idempotencyKey: { type: 'string' },
  reason: { type: 'string' },
  actorId: id,
  createdAt: date,
});
export const settlementSchema = object({
  id,
  gymId: id,
  periodStart: date,
  periodEnd: date,
  grossAmount: money,
  commissionAmount: money,
  refundAmount: money,
  netAmount: money,
  currency,
  status: { type: 'string', enum: Object.values(SettlementStatus) },
  generatedAt: date,
  processedAt: date,
  paidAt: date,
  providerReference: { type: 'string', nullable: true },
  items: { type: 'array', items: object({ id, settlementId: id, earningId: id, amount: money }) },
  reversal: { ...reversalSchema, nullable: true },
});
const ledgerSchema = object({
  id,
  sourceId: id,
  sourceType: { type: 'string' },
  gymId: id,
  branchId: id,
  category: { type: 'string' },
  account: { type: 'string', enum: ['provider_clearing', 'platform_revenue', 'gym_payable'] },
  amount: {
    ...money,
    description: 'Signed change to this account; never sum different accounts as revenue',
  },
  currency,
  createdAt: date,
});
export const summarySchema = object({
  currency,
  grossRevenue: money,
  commission: money,
  refunds: money,
  netEarnings: money,
  pendingSettlement: money,
  paidSettlement: money,
  paymentCounts: {
    type: 'array',
    items: object({
      status: { type: 'string', enum: Object.values(PaymentStatus) },
      count: { type: 'integer' },
    }),
  },
});
export const detailSchema: SchemaObject = {
  oneOf: [paymentSchema, earningSchema, settlementSchema],
};
export const listSchema = object({
  data: {
    type: 'array',
    items: { oneOf: [paymentSchema, refundSchema, earningSchema, settlementSchema, ledgerSchema] },
  },
  meta: object({
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer' },
    totalPages: { type: 'integer' },
    hasNextPage: { type: 'boolean' },
    hasPreviousPage: { type: 'boolean' },
  }),
});
export const reconciliationSchema = object({
  findings: {
    type: 'array',
    items: object({
      code: {
        type: 'string',
        description: 'Stable financial integrity issue code; see Phase 5 runbook',
      },
      entityId: id,
    }),
  },
  scannedPayments: { type: 'integer' },
  nextCursor: { ...id, nullable: true },
  nextSettlementCursor: { ...id, nullable: true },
  scannedSettlements: { type: 'integer' },
  ancillaryResultsMayBeTruncated: { type: 'boolean' },
  mode: { type: 'string', enum: ['REPORT_ONLY'] },
});
export const webhookSchema = object({
  accepted: { type: 'boolean' },
  duplicate: { type: 'boolean' },
  reconciliationRequired: { type: 'boolean' },
});

export function FinanceResponse(
  summary: string,
  schema: SchemaObject,
  status = 200,
  description?: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiResponse({
      status,
      schema,
      description: 'Financial amounts are integer paise; currency is INR.',
    }),
  );
}
export function FinanceErrors(): ClassDecorator {
  const schema = object({
    success: { type: 'boolean', enum: [false] },
    error: object({ code: { type: 'string' }, message: { type: 'string' } }),
    timestamp: date,
    path: { type: 'string' },
    requestId: { type: 'string' },
  });
  return applyDecorators(
    ...[
      [400, 'VALIDATION_FAILED, INVALID_PAYMENT_SIGNATURE'],
      [401, 'UNAUTHORIZED: missing/expired bearer session (provider webhooks use signatures)'],
      [403, 'FORBIDDEN, INSUFFICIENT_ROLE: insufficient role, scope or disabled simulation'],
      [
        404,
        'PAYMENT_NOT_FOUND, BOOKING_NOT_FOUND, GYM_NOT_FOUND, BRANCH_NOT_FOUND, SETTLEMENT_NOT_FOUND, NOT_FOUND',
      ],
      [
        409,
        'INVALID_PAYMENT_STATE, PAYMENT_VERIFICATION_FAILED, PAYMENT_AMOUNT_MISMATCH, PAYMENT_ORDER_CREATION_FAILED, RESERVATION_EXPIRED, REFUND_NOT_ALLOWED, REFUND_AMOUNT_EXCEEDED, INVALID_SETTLEMENT_STATE, IDEMPOTENCY_KEY_CONFLICT, FINANCIAL_INTEGRITY_ERROR',
      ],
      [429, 'RATE_LIMIT_EXCEEDED'],
      [
        500,
        'INTERNAL_ERROR: provider or infrastructure failure; do not blindly repeat external writes',
      ],
    ].map(([status, description]) =>
      ApiResponse({ status: Number(status), description: String(description), schema }),
    ),
  );
}
