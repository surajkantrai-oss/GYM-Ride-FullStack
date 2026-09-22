import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface HealthResult {
  status: 'ok' | 'error';
  services: { application: 'up'; database: 'up' | 'down'; redis: 'up' | 'down' };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}
  async check(): Promise<HealthResult> {
    const [database, redis] = await Promise.all([this.prisma.isHealthy(), this.redis.isHealthy()]);
    return {
      status: database && redis ? 'ok' : 'error',
      services: {
        application: 'up',
        database: database ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      },
    };
  }
}
