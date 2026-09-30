import { BookingStatus, BranchStatus, GymStatus, SlotStatus } from '@prisma/client';
import { SlotsService } from './slots.service';

describe('SlotsService capacity', () => {
  it('returns null without creating data for a first-time authorized branch', async () => {
    const prisma = {
      branchSlotConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const access = { assertBranchManagement: jest.fn().mockResolvedValue(undefined) };
    const service = new SlotsService(prisma as never, access as never);

    await expect(service.getConfig({ id: 'owner' } as never, 'branch')).resolves.toBeNull();
    expect(access.assertBranchManagement).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'owner' }),
      'branch',
    );
    expect(prisma.branchSlotConfig.findUnique).toHaveBeenCalledWith({
      where: { branchId: 'branch' },
    });
  });

  it('persists the first slot configuration with the existing upsert contract', async () => {
    const dto = {
      slotDurationMinutes: 45,
      defaultCapacity: 16,
      bookingWindowDays: 21,
      minimumAdvanceMinutes: 30,
      isActive: false,
    };
    const prisma = {
      branchSlotConfig: { upsert: jest.fn().mockResolvedValue({ branchId: 'branch', ...dto }) },
      slotInstance: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      gymBranch: { findUnique: jest.fn().mockResolvedValue({ slotConfig: { isActive: false } }) },
    };
    const access = { assertBranchManagement: jest.fn().mockResolvedValue(undefined) };
    const service = new SlotsService(prisma as never, access as never);

    await expect(service.putConfig({ id: 'owner' } as never, 'branch', dto)).resolves.toEqual({
      branchId: 'branch',
      ...dto,
    });
    expect(prisma.branchSlotConfig.upsert).toHaveBeenCalledWith({
      where: { branchId: 'branch' },
      update: dto,
      create: { branchId: 'branch', ...dto },
    });
  });

  it('does not read or write slot settings when branch authorization fails', async () => {
    const denied = new Error('Branch not found');
    const prisma = {
      branchSlotConfig: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    const access = { assertBranchManagement: jest.fn().mockRejectedValue(denied) };
    const service = new SlotsService(prisma as never, access as never);

    await expect(service.getConfig({ id: 'other-owner' } as never, 'foreign')).rejects.toBe(denied);
    await expect(
      service.putConfig({ id: 'other-owner' } as never, 'foreign', {} as never),
    ).rejects.toBe(denied);
    expect(prisma.branchSlotConfig.findUnique).not.toHaveBeenCalled();
    expect(prisma.branchSlotConfig.upsert).not.toHaveBeenCalled();
  });

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
