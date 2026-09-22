import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingEventType, BookingStatus } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ReservationExpirationService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ReservationExpirationService.name);
  private queue?: Queue;
  private worker?: Worker;
  private readonly enabled: boolean;
  private readonly connection: { host: string; port: number; password?: string };
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('BOOKING_QUEUE_ENABLED', false);
    this.connection = {
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
    };
  }
  onModuleInit(): void {
    if (!this.enabled) return;
    this.queue = new Queue('booking-expiration', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    this.worker = new Worker(
      'booking-expiration',
      (job: Job<{ bookingId: string }>) => this.expire(job.data.bookingId),
      { connection: this.connection, concurrency: 10 },
    );
    this.worker.on('failed', (job, error) => {
      const data = job?.data as { bookingId: string } | undefined;
      this.logger.error(
        { bookingId: data?.bookingId, jobId: job?.id, error: error.message },
        'Reservation expiration job failed',
      );
    });
  }
  async schedule(bookingId: string, expiresAt: Date): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      'expire',
      { bookingId },
      { jobId: `expire-${bookingId}`, delay: Math.max(0, expiresAt.getTime() - Date.now()) },
    );
  }
  async expire(bookingId: string): Promise<boolean> {
    const changed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: BookingStatus.PAYMENT_PENDING,
          reservationExpiresAt: { lte: new Date() },
        },
        data: { status: BookingStatus.EXPIRED },
      });
      if (!result.count) return false;
      await tx.bookingEvent.create({
        data: {
          bookingId,
          type: BookingEventType.BOOKING_EXPIRED,
          fromStatus: BookingStatus.PAYMENT_PENDING,
          toStatus: BookingStatus.EXPIRED,
        },
      });
      return true;
    });
    if (changed) this.logger.log({ bookingId }, 'Reservation expired');
    return changed;
  }
  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
