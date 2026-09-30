/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GymOsService } from './gym-os.service';
import { GymOsMembershipService } from './gym-os-membership.service';
import { GymOsAttendanceService } from './gym-os-attendance.service';

/** Request-time expiry is authoritative; this bounded periodic sweep is an idempotent accelerator. */
@Injectable()
export class GymOsLifecycleService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly gymOs: GymOsService,
    private readonly config: ConfigService,
    private readonly memberships: GymOsMembershipService,
    private readonly attendance: GymOsAttendanceService,
  ) {}
  onModuleInit() {
    if (!this.config.get<boolean>('GYMOS_RECONCILIATION_ENABLED', true)) return;
    this.timer = setInterval(
      () =>
        void Promise.all([
          this.gymOs.reconcile(),
          this.gymOs.sendExpiryReminders(),
          this.memberships.reconcile(),
          this.attendance.cleanup(),
        ]).catch(() => undefined),
      60 * 60 * 1000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
