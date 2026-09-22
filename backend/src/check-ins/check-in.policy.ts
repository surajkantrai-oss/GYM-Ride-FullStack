import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';

export interface CheckInWindow {
  opensAt: Date;
  closesAt: Date;
  completesAt: Date;
  noShowAt: Date;
}

@Injectable()
export class CheckInPolicy {
  private readonly openBeforeMinutes: number;
  private readonly closeAfterMinutes: number;
  private readonly completionGraceMinutes: number;

  constructor(config: ConfigService) {
    this.openBeforeMinutes = config.get<number>('CHECK_IN_OPEN_BEFORE_MINUTES', 15);
    this.closeAfterMinutes = config.get<number>('CHECK_IN_CLOSE_AFTER_MINUTES', 30);
    this.completionGraceMinutes = config.get<number>('CHECK_IN_COMPLETION_GRACE_MINUTES', 15);
  }

  window(slot: { startAt: Date; endAt: Date }): CheckInWindow {
    const opensAt = new Date(slot.startAt.getTime() - this.openBeforeMinutes * 60_000);
    const closesAt = new Date(slot.startAt.getTime() + this.closeAfterMinutes * 60_000);
    const completesAt = new Date(slot.endAt.getTime() + this.completionGraceMinutes * 60_000);
    return {
      opensAt,
      closesAt,
      completesAt,
      noShowAt: new Date(Math.max(closesAt.getTime(), slot.endAt.getTime())),
    };
  }

  assertOpen(window: CheckInWindow, now: Date): void {
    if (now < window.opensAt)
      throw new DomainException(
        ApiErrorCode.CHECK_IN_TOO_EARLY,
        'Check-in has not opened yet',
        HttpStatus.CONFLICT,
        { opensAt: window.opensAt.toISOString() },
      );
    if (now > window.closesAt)
      throw new DomainException(
        ApiErrorCode.CHECK_IN_WINDOW_CLOSED,
        'Check-in window has closed',
        HttpStatus.CONFLICT,
        { closesAt: window.closesAt.toISOString() },
      );
  }
}
