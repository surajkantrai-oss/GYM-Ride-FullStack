import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { normalizePhone } from '../common/utils/phone';
import { RedisService } from '../redis/redis.service';
import { OTP_PROVIDER, OtpProvider } from './providers/otp-provider';

const VERIFY_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'EXPIRED' end
local value = cjson.decode(raw)
if value.attempts >= tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]); return 'ATTEMPTS' end
if value.hash ~= ARGV[1] then
  value.attempts = value.attempts + 1
  if value.attempts >= tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]); return 'ATTEMPTS' end
  redis.call('SET', KEYS[1], cjson.encode(value), 'KEEPTTL'); return 'INVALID'
end
redis.call('DEL', KEYS[1]); return 'VALID'`;

@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(OTP_PROVIDER) private readonly provider: OtpProvider,
  ) {}

  async request(
    rawPhone: string,
    ip: string,
  ): Promise<{ message: string; expiresIn: number; developmentOtp?: string }> {
    const phone = normalizePhone(rawPhone);
    const id = this.identifier(phone);
    const cooldown = this.config.getOrThrow<number>('OTP_RESEND_COOLDOWN_SECONDS');
    if (!(await this.redis.set(`otp:cooldown:${id}`, '1', cooldown, true))) this.rateLimited();
    const window = this.config.getOrThrow<number>('OTP_REQUEST_WINDOW_SECONDS');
    const limit = this.config.getOrThrow<number>('OTP_REQUEST_LIMIT');
    const [phoneCount, ipCount] = await Promise.all([
      this.redis.incrementWithWindow(`otp:requests:phone:${id}`, window),
      this.redis.incrementWithWindow(`otp:requests:ip:${this.identifier(ip)}`, window),
    ]);
    if (phoneCount > limit || ipCount > limit * 5) this.rateLimited();
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttl = this.config.getOrThrow<number>('OTP_TTL_SECONDS');
    await this.redis.set(
      `otp:challenge:${id}`,
      JSON.stringify({ hash: this.hash(phone, otp), attempts: 0 }),
      ttl,
    );
    const delivery = await this.provider.send(phone, otp);
    return { message: 'OTP requested', expiresIn: ttl, ...delivery };
  }

  async verify(rawPhone: string, otp: string): Promise<string> {
    const phone = normalizePhone(rawPhone);
    const result = await this.redis.evaluate(
      VERIFY_SCRIPT,
      [`otp:challenge:${this.identifier(phone)}`],
      [this.hash(phone, otp), String(this.config.getOrThrow<number>('OTP_MAX_ATTEMPTS'))],
    );
    if (result === 'VALID') return phone;
    if (result === 'ATTEMPTS')
      throw new DomainException(
        ApiErrorCode.OTP_ATTEMPTS_EXCEEDED,
        'OTP attempts exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (result === 'EXPIRED')
      throw new DomainException(ApiErrorCode.OTP_EXPIRED, 'OTP expired or not requested');
    throw new DomainException(ApiErrorCode.INVALID_OTP, 'Invalid OTP');
  }

  private identifier(value: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('OTP_HASH_SECRET'))
      .update(value)
      .digest('hex');
  }
  private hash(phone: string, otp: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('OTP_HASH_SECRET'))
      .update(`${phone}:${otp}`)
      .digest('hex');
  }
  private rateLimited(): never {
    throw new DomainException(
      ApiErrorCode.OTP_RATE_LIMITED,
      'OTP request rate limit exceeded',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
