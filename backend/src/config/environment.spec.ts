import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const valid = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost/gymride',
    REDIS_HOST: 'localhost',
    JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
    JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters',
    OTP_HASH_SECRET: 'otp-secret-with-at-least-32-characters-long',
    CHECK_IN_TOKEN_SECRET: 'check-in-secret-with-at-least-32-characters',
  };

  it('applies safe numeric defaults', () => {
    expect(validateEnvironment(valid)).toMatchObject({
      PORT: 3000,
      REDIS_PORT: 6379,
      THROTTLE_LIMIT: 100,
      CHECK_IN_TOKEN_TTL_SECONDS: 180,
      CHECK_IN_OPEN_BEFORE_MINUTES: 15,
    });
  });

  it('rejects missing infrastructure configuration', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test', REDIS_HOST: 'localhost' })).toThrow(
      'DATABASE_URL is required',
    );
  });

  it('rejects unsupported environments', () => {
    expect(() => validateEnvironment({ ...valid, NODE_ENV: 'preview' })).toThrow(
      'NODE_ENV must be one of',
    );
  });
});
