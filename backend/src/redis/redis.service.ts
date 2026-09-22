import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly client: Redis;
  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
    });
    this.client.on('error', () => undefined);
  }
  async isHealthy(): Promise<boolean> {
    try {
      if (this.client.status === 'wait') await this.client.connect();
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    ttlSeconds: number,
    onlyIfAbsent = false,
  ): Promise<boolean> {
    await this.ensureConnected();
    const result = onlyIfAbsent
      ? await this.client.set(key, value, 'EX', ttlSeconds, 'NX')
      : await this.client.set(key, value, 'EX', ttlSeconds);
    return result === 'OK';
  }

  async incrementWithWindow(key: string, windowSeconds: number): Promise<number> {
    await this.ensureConnected();
    const count = await this.client.incr(key);
    if (count === 1) await this.client.expire(key, windowSeconds);
    return count;
  }

  async evaluate(script: string, keys: string[], arguments_: string[]): Promise<unknown> {
    await this.ensureConnected();
    return this.client.eval(script, keys.length, ...keys, ...arguments_);
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
  }
  onApplicationShutdown(): void {
    if (this.client.status !== 'end') this.client.disconnect();
  }
}
