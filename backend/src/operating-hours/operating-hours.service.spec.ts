import { Weekday } from '@prisma/client';
import { OperatingHoursService } from './operating-hours.service';

describe('OperatingHoursService validation', () => {
  const service = new OperatingHoursService({} as never, {} as never);
  it('accepts split periods and closed days', () => {
    expect(() =>
      service.validate([
        { weekday: Weekday.MONDAY, isClosed: false, opensAt: '06:00', closesAt: '12:00' },
        { weekday: Weekday.MONDAY, isClosed: false, opensAt: '16:00', closesAt: '23:00' },
        { weekday: Weekday.SUNDAY, isClosed: true },
      ]),
    ).not.toThrow();
  });
  it('rejects overlapping periods', () => {
    expect(() =>
      service.validate([
        { weekday: Weekday.MONDAY, isClosed: false, opensAt: '08:00', closesAt: '12:00' },
        { weekday: Weekday.MONDAY, isClosed: false, opensAt: '11:00', closesAt: '15:00' },
      ]),
    ).toThrow('Operating-hour periods cannot overlap');
  });
  it('rejects invalid ranges and ambiguous closed days', () => {
    expect(() =>
      service.validate([
        { weekday: Weekday.MONDAY, isClosed: false, opensAt: '12:00', closesAt: '08:00' },
      ]),
    ).toThrow();
    expect(() =>
      service.validate([{ weekday: Weekday.SUNDAY, isClosed: true, opensAt: '08:00' }]),
    ).toThrow();
  });
});
