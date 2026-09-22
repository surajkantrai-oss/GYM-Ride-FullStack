import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';

@Injectable()
export class AmenitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
  ) {}
  list(): Promise<unknown[]> {
    return this.prisma.amenity.findMany({
      select: { id: true, slug: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
  }
  async replace(user: AuthUser, branchId: string, amenityIds: string[]): Promise<unknown[]> {
    await this.access.assertBranchManagement(user, branchId);
    const count = await this.prisma.amenity.count({ where: { id: { in: amenityIds } } });
    if (count !== amenityIds.length)
      throw new DomainException(
        ApiErrorCode.AMENITY_NOT_FOUND,
        'One or more amenities do not exist',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.branchAmenity.deleteMany({ where: { branchId } });
      if (amenityIds.length)
        await tx.branchAmenity.createMany({
          data: amenityIds.map((amenityId) => ({ branchId, amenityId })),
        });
    });
    return this.prisma.amenity.findMany({
      where: { id: { in: amenityIds } },
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
