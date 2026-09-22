import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  const values: Record<string, unknown> = {
    OTP_RESEND_COOLDOWN_SECONDS: 45,
    OTP_REQUEST_WINDOW_SECONDS: 3600,
    OTP_REQUEST_LIMIT: 5,
    OTP_TTL_SECONDS: 300,
    OTP_MAX_ATTEMPTS: 5,
    OTP_HASH_SECRET: 'otp-secret-with-at-least-32-characters-long',
  };
  const config = { getOrThrow: (key: string) => values[key] } as ConfigService;
  it('stores only a hash and exposes OTP only through the development provider', async () => {
    const redis = {
      set: jest.fn().mockResolvedValue(true),
      incrementWithWindow: jest.fn().mockResolvedValue(1),
      evaluate: jest.fn(),
    };
    const provider = {
      send: jest.fn((_phone: string, otp: string) => Promise.resolve({ developmentOtp: otp })),
    };
    const result = await new OtpService(redis as never, config, provider).request(
      '+919876543210',
      '127.0.0.1',
    );
    expect(result.developmentOtp).toMatch(/^\d{6}$/);
    const stored = String(redis.set.mock.calls[1]?.[1]);
    expect(stored).not.toContain(result.developmentOtp!);
  });
  it.each([
    ['EXPIRED', 'OTP expired or not requested'],
    ['INVALID', 'Invalid OTP'],
    ['ATTEMPTS', 'OTP attempts exceeded'],
  ])('maps atomic verification result %s', async (result, message) => {
    const redis = { evaluate: jest.fn().mockResolvedValue(result) };
    const service = new OtpService(redis as never, config, { send: jest.fn() });
    await expect(service.verify('+919876543210', '123456')).rejects.toThrow(message);
  });
  it('consumes a successful challenge and rejects replay based on Redis result', async () => {
    const redis = {
      evaluate: jest.fn().mockResolvedValueOnce('VALID').mockResolvedValueOnce('EXPIRED'),
    };
    const service = new OtpService(redis as never, config, { send: jest.fn() });
    await expect(service.verify('+919876543210', '123456')).resolves.toBe('+919876543210');
    await expect(service.verify('+919876543210', '123456')).rejects.toThrow('OTP expired');
  });
  it('enforces resend cooldown before generating another OTP', async () => {
    const redis = { set: jest.fn().mockResolvedValue(false) };
    const service = new OtpService(redis as never, config, { send: jest.fn() });
    await expect(service.request('+919876543210', '127.0.0.1')).rejects.toThrow('rate limit');
  });
});
