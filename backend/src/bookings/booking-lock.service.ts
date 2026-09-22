import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class BookingLockService {
  private readonly logger = new Logger(BookingLockService.name);
  private readonly ttl: number;
  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.ttl = config.get<number>('BOOKING_LOCK_TTL_SECONDS', 15);
  }

  async withSlotLock<T>(slotId: string, operation: () => Promise<T>): Promise<T> {
    const key = `booking-lock:${slotId}`;
    const token = randomUUID();
    let acquired = false;
    try {
      acquired = await this.redis.set(key, token, this.ttl, true);
    } catch {
      this.logger.warn(
        { slotId },
        'Redis booking lock unavailable; database row lock remains authoritative',
      );
    }
    try {
      return await operation();
    } finally {
      if (acquired) {
        try {
          await this.redis.evaluate(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            [key],
            [token],
          );
        } catch {
          this.logger.warn({ slotId }, 'Redis booking lock release failed');
        }
      }
    }
  }
}
