import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@prisma/client';
import {
  assertPaymentTransition,
  CommissionService,
  proportional,
  RefundPolicy,
} from './finance-policy';

describe('financial domain policies', () => {
  const config = new ConfigService({
    DEFAULT_PLATFORM_COMMISSION_BPS: 1500,
    REFUND_MINIMUM_HOURS: 2,
  });
  it('snapshots integer commission and gym payable', () => {
    expect(new CommissionService(config).calculate(100000)).toEqual({
      commissionAmount: 15000,
      commissionBps: 1500,
      commissionVersion: 'default-v1',
      netAmount: 85000,
    });
  });
  it.each([
    [1, 0],
    [10, 2],
    [101, 15],
    [999, 150],
  ])('rounds %i deterministically', (amount, expected) => {
    expect(new CommissionService(config).calculate(amount).commissionAmount).toBe(expected);
  });
  it('fully reverses original commission on cumulative full refund', () => {
    expect(proportional(15000, 100000, 100000)).toBe(15000);
    expect(proportional(15000, 50000, 100000)).toBe(7500);
  });
  it.each([-1, NaN, Infinity, 1.5])('rejects invalid money %s', (amount) => {
    expect(() => proportional(amount, 1, 10)).toThrow();
  });
  it.each([
    ['CREATED', 'PENDING'],
    ['PENDING', 'AUTHORIZED'],
    ['AUTHORIZED', 'SUCCESS'],
    ['SUCCESS', 'REFUND_PENDING'],
    ['REFUND_PENDING', 'REFUNDED'],
    ['EXPIRED', 'SUCCESS'],
  ])('allows %s to %s', (from, to) => {
    expect(() => assertPaymentTransition(from as PaymentStatus, to as PaymentStatus)).not.toThrow();
  });
  it.each([
    ['CREATED', 'SUCCESS'],
    ['SUCCESS', 'FAILED'],
    ['REFUNDED', 'SUCCESS'],
    ['PENDING', 'REFUNDED'],
  ])('rejects %s to %s', (from, to) => {
    expect(() => assertPaymentTransition(from as PaymentStatus, to as PaymentStatus)).toThrow();
  });
  it('allows idempotent state observations', () => {
    expect(() => assertPaymentTransition('SUCCESS', 'SUCCESS')).not.toThrow();
  });
  it('enforces refund window and explicit override', () => {
    const policy = new RefundPolicy(config);
    expect(() =>
      policy.assertAllowed('CONFIRMED', new Date(Date.now() + 3600000), false),
    ).toThrow();
    expect(() =>
      policy.assertAllowed('CONFIRMED', new Date(Date.now() + 10800000), false),
    ).not.toThrow();
    expect(() => policy.assertAllowed('CONFIRMED', new Date(0), true)).not.toThrow();
  });
});
