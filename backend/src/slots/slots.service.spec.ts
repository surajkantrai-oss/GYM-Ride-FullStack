import { BookingStatus, BranchStatus, GymStatus, SlotStatus } from '@prisma/client';
import { SlotsService } from './slots.service';

describe('SlotsService capacity', () => {
  it('subtracts confirmed and unexpired reservations in one aggregated read', async () => {
    const branch = {
      status: BranchStatus.ACTIVE,
      gym: { status: GymStatus.APPROVED },
      timezone: 'Asia/Kolkata',
      slotConfig: { isActive: false },
    };
    const prisma = {
      gymBranch: { findUnique: jest.fn().mockResolvedValue(branch) },
      slotInstance: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'slot',
            startAt: new Date('2026-09-07T00:30:00Z'),
            endAt: new Date('2026-09-07T01:30:00Z'),
            capacity: 20,
            status: SlotStatus.AVAILABLE,
          },
        ]),
      },
      booking: {
        groupBy: jest.fn().mockResolvedValue([
          { slotId: 'slot', status: BookingStatus.CONFIRMED, _count: { _all: 15 } },
          { slotId: 'slot', status: BookingStatus.PAYMENT_PENDING, _count: { _all: 3 } },
        ]),
      },
    };
    const service = new SlotsService(prisma as never, {} as never);
    const result = await service.publicAvailability('branch', '2026-09-07');
    expect(result[0]).toEqual(
      expect.objectContaining({ confirmed: 15, reserved: 3, available: 2 }),
    );
    expect(prisma.booking.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              status: BookingStatus.PAYMENT_PENDING,
              reservationExpiresAt: expect.objectContaining({ gt: expect.any(Date) }),
            }),
          ]),
        }),
      }),
    );
  });

  it('generates only inside the finite horizon and skips a closed exception date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-07T00:00:00Z'));
    const closed = new Date('2026-09-08T00:00:00Z');
    const prisma = {
      gymBranch: {
        findUnique: jest.fn().mockResolvedValue({
          timezone: 'Asia/Kolkata',
          slotConfig: {
            isActive: true,
            bookingWindowDays: 1,
            slotDurationMinutes: 60,
            defaultCapacity: 20,
          },
          exceptions: [{ date: closed, isClosed: true }],
          operatingHours: Object.values([
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
            'SATURDAY',
            'SUNDAY',
          ]).map((weekday) => ({
            weekday,
            isClosed: false,
            opensAt: new Date('1970-01-01T06:00:00Z'),
            closesAt: new Date('1970-01-01T08:00:00Z'),
          })),
        }),
      },
      slotInstance: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const service = new SlotsService(prisma as never, {} as never);
    await service.ensureHorizon('branch');
    expect(prisma.slotInstance.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.slotInstance.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ capacity: 20 })]),
        skipDuplicates: true,
      }),
    );
    jest.useRealTimers();
  });
});
