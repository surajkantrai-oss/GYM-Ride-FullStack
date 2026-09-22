import { generateSlotRanges } from './slot-generation';

describe('slot generation', () => {
  it('generates complete slots for split periods and drops a partial tail', () => {
    const slots = generateSlotRanges(
      '2026-09-07',
      'Asia/Kolkata',
      [
        { opensAt: '06:00', closesAt: '08:30' },
        { opensAt: '16:00', closesAt: '18:00' },
      ],
      60,
    );
    expect(slots).toHaveLength(4);
    expect(slots[0]!.startAt.toISOString()).toBe('2026-09-07T00:30:00.000Z');
    expect(slots[1]!.endAt.toISOString()).toBe('2026-09-07T02:30:00.000Z');
  });

  it('uses IANA timezone rules, including daylight-saving changes', () => {
    const winter = generateSlotRanges(
      '2026-01-15',
      'America/New_York',
      [{ opensAt: '09:00', closesAt: '10:00' }],
      60,
    );
    const summer = generateSlotRanges(
      '2026-07-15',
      'America/New_York',
      [{ opensAt: '09:00', closesAt: '10:00' }],
      60,
    );
    expect(winter[0]!.startAt.toISOString()).toBe('2026-01-15T14:00:00.000Z');
    expect(summer[0]!.startAt.toISOString()).toBe('2026-07-15T13:00:00.000Z');
  });

  it('generates no slots for a closed day represented by no periods', () => {
    expect(generateSlotRanges('2026-09-07', 'Asia/Kolkata', [], 60)).toEqual([]);
  });
});
