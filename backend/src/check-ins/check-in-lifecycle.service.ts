import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { CheckInPolicy } from './check-in.policy';
import { CheckInService } from './check-in.service';

@Injectable()
export class CheckInLifecycleService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(CheckInLifecycleService.name);
  private readonly enabled: boolean;
  private readonly connection: { host: string; port: number; password?: string };
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkIns: CheckInService,
    private readonly policy: CheckInPolicy,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('CHECK_IN_QUEUE_ENABLED', false);
    this.connection = {
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
    };
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    this.queue = new Queue('booking-check-in-lifecycle', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    this.worker = new Worker(
      'booking-check-in-lifecycle',
      (job: Job<{ bookingId?: string }>) =>
        job.data.bookingId
          ? this.checkIns.syncBooking(job.data.bookingId)
          : this.checkIns.syncScope({}),
      { connection: this.connection, concurrency: 10 },
    );
    this.worker.on('failed', (job, error) => {
      const data = job?.data as { bookingId?: string } | undefined;
      this.logger.error(
        { bookingId: data?.bookingId, jobId: job?.id, error: error.message },
        'Check-in lifecycle job failed',
      );
    });
    await this.queue.add('sweep', {}, { jobId: 'check-in-sweep', repeat: { every: 60_000 } });
    await this.reconcileSchedules();
  }

  async scheduleBooking(bookingId: string): Promise<void> {
    if (!this.queue) return;
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, slot: { select: { startAt: true, endAt: true } } },
    });
    if (!booking?.slot || booking.status !== BookingStatus.CONFIRMED) return;
    const window = this.policy.window(booking.slot);
    await Promise.all([
      this.queue.add(
        'open',
        { bookingId },
        {
          jobId: `check-in-open-${bookingId}`,
          delay: Math.max(0, window.opensAt.getTime() - Date.now()),
        },
      ),
      this.queue.add(
        'no-show',
        { bookingId },
        {
          jobId: `check-in-no-show-${bookingId}`,
          delay: Math.max(0, window.noShowAt.getTime() - Date.now()),
        },
      ),
      this.queue.add(
        'complete',
        { bookingId },
        {
          jobId: `check-in-complete-${bookingId}`,
          delay: Math.max(0, window.completesAt.getTime() - Date.now()),
        },
      ),
    ]);
  }

  private async reconcileSchedules(): Promise<void> {
    const confirmed = await this.prisma.booking.findMany({
      where: { status: BookingStatus.CONFIRMED, slotId: { not: null } },
      select: { id: true },
      take: 1000,
    });
    await Promise.all(confirmed.map(({ id }) => this.scheduleBooking(id)));
    await this.checkIns.syncScope({});
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
