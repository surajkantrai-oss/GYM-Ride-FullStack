import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationProjectionService } from './notification-projection.service';

@Injectable()
export class NotificationJobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationJobsService.name);
  private readonly enabled: boolean;
  private readonly connection: { host: string; port: number; password?: string };
  private queue?: Queue;
  private worker?: Worker;

  constructor(config: ConfigService, private readonly projection: NotificationProjectionService, private readonly delivery: NotificationDeliveryService) {
    this.enabled = config.get<boolean>('NOTIFICATION_QUEUE_ENABLED', false);
    this.connection = { host: config.getOrThrow<string>('REDIS_HOST'), port: config.getOrThrow<number>('REDIS_PORT'), password: config.get<string>('REDIS_PASSWORD') || undefined };
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    this.queue = new Queue('notification-delivery', { connection: this.connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
    this.worker = new Worker('notification-delivery', async () => {
      await this.projection.catchUp();
      await this.delivery.deliverDue();
    }, { connection: this.connection, concurrency: 1 });
    this.worker.on('failed', (job, error) => this.logger.error({ jobId: job?.id, error: error.message }, 'Notification job failed'));
    await this.queue.add('sweep', {}, { jobId: 'notification-sweep', repeat: { every: 30_000 } });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
