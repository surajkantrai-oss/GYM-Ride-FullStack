import { HttpStatus, Injectable } from '@nestjs/common';
import { Weekday } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { OperatingPeriodDto } from './dto/operating-hours.dto';

@Injectable()
export class OperatingHoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
  ) {}
  async get(user: AuthUser, branchId: string): Promise<unknown[]> {
    await this.access.assertBranchManagement(user, branchId);
    return this.prisma.operatingHours.findMany({
      where: { branchId },
      select: {
        id: true,
        weekday: true,
        period: true,
        opensAt: true,
        closesAt: true,
        isClosed: true,
      },
      orderBy: [{ weekday: 'asc' }, { period: 'asc' }],
    });
  }
  async replace(
    user: AuthUser,
    branchId: string,
    periods: OperatingPeriodDto[],
  ): Promise<unknown[]> {
    await this.access.assertBranchManagement(user, branchId);
    this.validate(periods);
    const grouped = new Map<Weekday, number>();
    const data = periods.map((item) => {
      const period = (grouped.get(item.weekday) ?? 0) + 1;
      grouped.set(item.weekday, period);
      return {
        branchId,
        weekday: item.weekday,
        period,
        isClosed: item.isClosed,
        opensAt: item.opensAt ? this.time(item.opensAt) : null,
        closesAt: item.closesAt ? this.time(item.closesAt) : null,
      };
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.operatingHours.deleteMany({ where: { branchId } });
      await tx.operatingHours.createMany({ data });
    });
    return this.get(user, branchId);
  }
  validate(periods: OperatingPeriodDto[]): void {
    for (const weekday of Object.values(Weekday)) {
      const day = periods.filter((item) => item.weekday === weekday);
      if (!day.length) continue;
      if (day.some((item) => item.isClosed)) {
        if (day.length !== 1 || day[0]?.opensAt || day[0]?.closesAt)
          this.invalid('Closed days cannot contain open periods');
        continue;
      }
      const ranges = day
        .map((item) => {
          if (!item.opensAt || !item.closesAt || item.opensAt >= item.closesAt)
            this.invalid('Opening time must be before closing time');
          return [item.opensAt, item.closesAt] as const;
        })
        .sort(([left], [right]) => left.localeCompare(right));
      for (let index = 1; index < ranges.length; index += 1)
        if (ranges[index]![0] < ranges[index - 1]![1])
          this.invalid('Operating-hour periods cannot overlap');
    }
  }
  private time(value: string): Date {
    return new Date(`1970-01-01T${value}:00.000Z`);
  }
  private invalid(message: string): never {
    throw new DomainException(
      ApiErrorCode.OPERATING_HOURS_OVERLAP,
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
