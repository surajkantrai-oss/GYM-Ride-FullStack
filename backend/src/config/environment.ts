export const environments = ['development', 'test', 'staging', 'production'] as const;
export type Environment = (typeof environments)[number];

export interface AppEnvironment {
  PUSH_PROVIDER: string;
  NOTIFICATION_QUEUE_ENABLED: boolean;
  PAYMENT_PROVIDER: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  DEFAULT_PLATFORM_COMMISSION_BPS: number;
  REFUND_MINIMUM_HOURS: number;
  NODE_ENV: Environment;
  PORT: number;
  DATABASE_URL: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  CORS_ORIGINS: string;
  LOG_LEVEL: string;
  THROTTLE_TTL_MS: number;
  THROTTLE_LIMIT: number;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  JWT_REFRESH_TTL_SECONDS: number;
  OTP_HASH_SECRET: string;
  OTP_TTL_SECONDS: number;
  OTP_MAX_ATTEMPTS: number;
  OTP_RESEND_COOLDOWN_SECONDS: number;
  OTP_REQUEST_LIMIT: number;
  OTP_REQUEST_WINDOW_SECONDS: number;
  BOOKING_RESERVATION_TTL_SECONDS: number;
  BOOKING_LOCK_TTL_SECONDS: number;
  BOOKING_QUEUE_ENABLED: boolean;
  CHECK_IN_TOKEN_SECRET: string;
  CHECK_IN_TOKEN_TTL_SECONDS: number;
  CHECK_IN_OPEN_BEFORE_MINUTES: number;
  CHECK_IN_CLOSE_AFTER_MINUTES: number;
  CHECK_IN_COMPLETION_GRACE_MINUTES: number;
  CHECK_IN_OTP_TTL_SECONDS: number;
  CHECK_IN_OTP_MAX_ATTEMPTS: number;
  CHECK_IN_OTP_RESEND_COOLDOWN_SECONDS: number;
  CHECK_IN_OTP_REQUEST_LIMIT: number;
  CHECK_IN_OTP_REQUEST_WINDOW_SECONDS: number;
  CHECK_IN_QUEUE_ENABLED: boolean;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function integer(value: unknown, name: string, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}

function nonNegativeInteger(value: unknown, name: string, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

export function validateEnvironment(raw: Record<string, unknown>): AppEnvironment {
  const nodeEnv = text(raw.NODE_ENV, 'development');
  if (!environments.includes(nodeEnv as Environment))
    throw new Error(`NODE_ENV must be one of: ${environments.join(', ')}`);
  const paymentProvider = text(raw.PAYMENT_PROVIDER, 'development');
  const pushProvider = text(raw.PUSH_PROVIDER, 'development');
  if (!['development', 'expo'].includes(pushProvider)) throw new Error('Unsupported PUSH_PROVIDER');
  if (pushProvider === 'development' && !['development', 'test'].includes(nodeEnv))
    throw new Error('Development push provider cannot run outside development/test');
  if (!['development', 'razorpay'].includes(paymentProvider))
    throw new Error('Unsupported PAYMENT_PROVIDER');
  if (paymentProvider === 'development' && !['development', 'test'].includes(nodeEnv))
    throw new Error('Development payments cannot run outside development/test');
  if (paymentProvider === 'razorpay')
    for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) {
      if (!text(raw[key], '').trim()) throw new Error(`${key} is required for Razorpay`);
    }
  const commissionBps = Number(raw.DEFAULT_PLATFORM_COMMISSION_BPS ?? 1500);
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000)
    throw new Error('Commission must be between 0 and 10000 basis points');
  const refundHours = Number(raw.REFUND_MINIMUM_HOURS ?? 2);
  if (!Number.isInteger(refundHours) || refundHours < 0 || refundHours > 8760)
    throw new Error('Invalid refund window');
  if (!environments.includes(nodeEnv as Environment)) {
    throw new Error(`NODE_ENV must be one of: ${environments.join(', ')}`);
  }
  const required = [
    'DATABASE_URL',
    'REDIS_HOST',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'OTP_HASH_SECRET',
    'CHECK_IN_TOKEN_SECRET',
  ] as const;
  for (const name of required) {
    if (typeof raw[name] !== 'string' || raw[name].trim() === '')
      throw new Error(`${name} is required`);
  }
  for (const name of [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'OTP_HASH_SECRET',
    'CHECK_IN_TOKEN_SECRET',
  ] as const) {
    if (text(raw[name], '').length < 32) throw new Error(`${name} must be at least 32 characters`);
  }
  return {
    PUSH_PROVIDER: pushProvider,
    NOTIFICATION_QUEUE_ENABLED: boolean(raw.NOTIFICATION_QUEUE_ENABLED, nodeEnv === 'production'),
    PAYMENT_PROVIDER: paymentProvider,
    RAZORPAY_KEY_ID: text(raw.RAZORPAY_KEY_ID, ''),
    RAZORPAY_KEY_SECRET: text(raw.RAZORPAY_KEY_SECRET, ''),
    RAZORPAY_WEBHOOK_SECRET: text(raw.RAZORPAY_WEBHOOK_SECRET, ''),
    DEFAULT_PLATFORM_COMMISSION_BPS: commissionBps,
    REFUND_MINIMUM_HOURS: refundHours,
    NODE_ENV: nodeEnv as Environment,
    PORT: integer(raw.PORT, 'PORT', 3000),
    DATABASE_URL: text(raw.DATABASE_URL, ''),
    REDIS_HOST: text(raw.REDIS_HOST, ''),
    REDIS_PORT: integer(raw.REDIS_PORT, 'REDIS_PORT', 6379),
    REDIS_PASSWORD:
      typeof raw.REDIS_PASSWORD === 'string' && raw.REDIS_PASSWORD ? raw.REDIS_PASSWORD : undefined,
    CORS_ORIGINS: text(raw.CORS_ORIGINS, ''),
    LOG_LEVEL: text(raw.LOG_LEVEL, 'info'),
    THROTTLE_TTL_MS: integer(raw.THROTTLE_TTL_MS, 'THROTTLE_TTL_MS', 60_000),
    THROTTLE_LIMIT: integer(raw.THROTTLE_LIMIT, 'THROTTLE_LIMIT', 100),
    JWT_ACCESS_SECRET: text(raw.JWT_ACCESS_SECRET, ''),
    JWT_REFRESH_SECRET: text(raw.JWT_REFRESH_SECRET, ''),
    JWT_ACCESS_TTL_SECONDS: integer(raw.JWT_ACCESS_TTL_SECONDS, 'JWT_ACCESS_TTL_SECONDS', 900),
    JWT_REFRESH_TTL_SECONDS: integer(
      raw.JWT_REFRESH_TTL_SECONDS,
      'JWT_REFRESH_TTL_SECONDS',
      2_592_000,
    ),
    OTP_HASH_SECRET: text(raw.OTP_HASH_SECRET, ''),
    OTP_TTL_SECONDS: integer(raw.OTP_TTL_SECONDS, 'OTP_TTL_SECONDS', 300),
    OTP_MAX_ATTEMPTS: integer(raw.OTP_MAX_ATTEMPTS, 'OTP_MAX_ATTEMPTS', 5),
    OTP_RESEND_COOLDOWN_SECONDS: integer(
      raw.OTP_RESEND_COOLDOWN_SECONDS,
      'OTP_RESEND_COOLDOWN_SECONDS',
      45,
    ),
    OTP_REQUEST_LIMIT: integer(raw.OTP_REQUEST_LIMIT, 'OTP_REQUEST_LIMIT', 5),
    OTP_REQUEST_WINDOW_SECONDS: integer(
      raw.OTP_REQUEST_WINDOW_SECONDS,
      'OTP_REQUEST_WINDOW_SECONDS',
      3_600,
    ),
    BOOKING_RESERVATION_TTL_SECONDS: integer(
      raw.BOOKING_RESERVATION_TTL_SECONDS,
      'BOOKING_RESERVATION_TTL_SECONDS',
      600,
    ),
    BOOKING_LOCK_TTL_SECONDS: integer(raw.BOOKING_LOCK_TTL_SECONDS, 'BOOKING_LOCK_TTL_SECONDS', 15),
    BOOKING_QUEUE_ENABLED: boolean(raw.BOOKING_QUEUE_ENABLED, nodeEnv === 'production'),
    CHECK_IN_TOKEN_SECRET: text(raw.CHECK_IN_TOKEN_SECRET, ''),
    CHECK_IN_TOKEN_TTL_SECONDS: integer(
      raw.CHECK_IN_TOKEN_TTL_SECONDS,
      'CHECK_IN_TOKEN_TTL_SECONDS',
      180,
    ),
    CHECK_IN_OPEN_BEFORE_MINUTES: nonNegativeInteger(
      raw.CHECK_IN_OPEN_BEFORE_MINUTES,
      'CHECK_IN_OPEN_BEFORE_MINUTES',
      15,
    ),
    CHECK_IN_CLOSE_AFTER_MINUTES: nonNegativeInteger(
      raw.CHECK_IN_CLOSE_AFTER_MINUTES,
      'CHECK_IN_CLOSE_AFTER_MINUTES',
      30,
    ),
    CHECK_IN_COMPLETION_GRACE_MINUTES: nonNegativeInteger(
      raw.CHECK_IN_COMPLETION_GRACE_MINUTES,
      'CHECK_IN_COMPLETION_GRACE_MINUTES',
      15,
    ),
    CHECK_IN_OTP_TTL_SECONDS: integer(
      raw.CHECK_IN_OTP_TTL_SECONDS,
      'CHECK_IN_OTP_TTL_SECONDS',
      180,
    ),
    CHECK_IN_OTP_MAX_ATTEMPTS: integer(
      raw.CHECK_IN_OTP_MAX_ATTEMPTS,
      'CHECK_IN_OTP_MAX_ATTEMPTS',
      5,
    ),
    CHECK_IN_OTP_RESEND_COOLDOWN_SECONDS: nonNegativeInteger(
      raw.CHECK_IN_OTP_RESEND_COOLDOWN_SECONDS,
      'CHECK_IN_OTP_RESEND_COOLDOWN_SECONDS',
      30,
    ),
    CHECK_IN_OTP_REQUEST_LIMIT: integer(
      raw.CHECK_IN_OTP_REQUEST_LIMIT,
      'CHECK_IN_OTP_REQUEST_LIMIT',
      5,
    ),
    CHECK_IN_OTP_REQUEST_WINDOW_SECONDS: integer(
      raw.CHECK_IN_OTP_REQUEST_WINDOW_SECONDS,
      'CHECK_IN_OTP_REQUEST_WINDOW_SECONDS',
      3600,
    ),
    CHECK_IN_QUEUE_ENABLED: boolean(raw.CHECK_IN_QUEUE_ENABLED, nodeEnv === 'production'),
  };
}
