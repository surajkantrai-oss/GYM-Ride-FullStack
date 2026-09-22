import { DateTime } from 'luxon';

export interface LocalPeriod {
  opensAt: string;
  closesAt: string;
}
export interface GeneratedRange {
  startAt: Date;
  endAt: Date;
}

export function generateSlotRanges(
  date: string,
  timezone: string,
  periods: LocalPeriod[],
  durationMinutes: number,
): GeneratedRange[] {
  const day = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  if (!day.isValid) throw new Error('Invalid local date or timezone');
  const ranges: GeneratedRange[] = [];
  for (const period of periods) {
    const [openHour, openMinute] = period.opensAt.split(':').map(Number);
    const [closeHour, closeMinute] = period.closesAt.split(':').map(Number);
    let cursor = day.set({ hour: openHour, minute: openMinute });
    const close = day.set({ hour: closeHour, minute: closeMinute });
    while (cursor.plus({ minutes: durationMinutes }) <= close) {
      const end = cursor.plus({ minutes: durationMinutes });
      ranges.push({ startAt: cursor.toUTC().toJSDate(), endAt: end.toUTC().toJSDate() });
      cursor = end;
    }
  }
  return ranges;
}
