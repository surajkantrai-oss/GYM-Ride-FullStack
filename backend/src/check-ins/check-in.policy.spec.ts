import { ConfigService } from '@nestjs/config';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { CheckInPolicy } from './check-in.policy';

describe('CheckInPolicy', () => {
  const policy = new CheckInPolicy(
    new ConfigService({
      CHECK_IN_OPEN_BEFORE_MINUTES: 15,
      CHECK_IN_CLOSE_AFTER_MINUTES: 30,
      CHECK_IN_COMPLETION_GRACE_MINUTES: 10,
    }),
  );
  const slot = {
    startAt: new Date('2026-09-17T10:00:00.000Z'),
    endAt: new Date('2026-09-17T11:00:00.000Z'),
  };

  it('calculates UTC instants without local-time arithmetic', () => {
    expect(policy.window(slot)).toEqual({
      opensAt: new Date('2026-09-17T09:45:00.000Z'),
      closesAt: new Date('2026-09-17T10:30:00.000Z'),
      completesAt: new Date('2026-09-17T11:10:00.000Z'),
      noShowAt: new Date('2026-09-17T11:00:00.000Z'),
    });
  });

  it('accepts exact window boundaries', () => {
    const window = policy.window(slot);
    expect(() => policy.assertOpen(window, window.opensAt)).not.toThrow();
    expect(() => policy.assertOpen(window, window.closesAt)).not.toThrow();
  });

  it('returns a stable early error with the authoritative opening time', () => {
    expect(() => policy.assertOpen(policy.window(slot), new Date('2026-09-17T09:44:59Z'))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ApiErrorCode.CHECK_IN_TOO_EARLY }),
      }),
    );
  });

  it('returns a stable closed-window error', () => {
    expect(() => policy.assertOpen(policy.window(slot), new Date('2026-09-17T10:30:01Z'))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ApiErrorCode.CHECK_IN_WINDOW_CLOSED }),
      }),
    );
  });

  it.each([
    ['Asia/Kolkata', '2026-01-15T10:00:00+05:30', '2026-01-15T04:15:00.000Z'],
    ['America/New_York DST', '2026-07-15T10:00:00-04:00', '2026-07-15T13:45:00.000Z'],
  ])('uses absolute instants for %s slots', (_zone, localStart, expectedOpen) => {
    const startAt = new Date(localStart);
    const window = policy.window({ startAt, endAt: new Date(startAt.getTime() + 60 * 60_000) });
    expect(window.opensAt.toISOString()).toBe(expectedOpen);
  });
});
