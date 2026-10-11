/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Injectable } from '@nestjs/common';
import { GymImageKind, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { ImageProcessorService } from '../media/image-processor.service';
import { UpdateGymImageDto, UploadGymImageDto } from './gym-images.dto';

export const gymImageSelect = {
  id: true,
  kind: true,
  sortOrder: true,
  mimeType: true,
  width: true,
  height: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GymImageSelect;

@Injectable()
export class GymImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
    private readonly images: ImageProcessorService,
  ) {}

  async upload(user: AuthUser, gymId: string, dto: UploadGymImageDto, file: Express.Multer.File) {
    await this.access.assertGymOwnerOrAdmin(user, gymId);
    const processed = await this.images.gymImage(file, dto.kind === GymImageKind.COVER);
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(gymId));
    return this.prisma.$transaction(async (tx) => {
      if (dto.kind === GymImageKind.COVER)
        await tx.gymImage.updateMany({
          where: { gymId, kind: GymImageKind.COVER },
          data: { kind: GymImageKind.GALLERY },
        });
      return tx.gymImage.create({
        data: { gymId, kind: dto.kind, sortOrder, ...processed },
        select: gymImageSelect,
      });
    });
  }

  async update(user: AuthUser, gymId: string, imageId: string, dto: UpdateGymImageDto) {
    await this.access.assertGymOwnerOrAdmin(user, gymId);
    await this.assertImage(gymId, imageId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.kind === GymImageKind.COVER)
        await tx.gymImage.updateMany({
          where: { gymId, kind: GymImageKind.COVER, id: { not: imageId } },
          data: { kind: GymImageKind.GALLERY },
        });
      return tx.gymImage.update({
        where: { id: imageId },
        data: dto,
        select: gymImageSelect,
      });
    });
  }

  async remove(user: AuthUser, gymId: string, imageId: string) {
    await this.access.assertGymOwnerOrAdmin(user, gymId);
    await this.assertImage(gymId, imageId);
    await this.prisma.gymImage.delete({ where: { id: imageId } });
  }

  content(imageId: string) {
    return this.prisma.gymImage.findUnique({
      where: { id: imageId },
      select: { data: true, mimeType: true, updatedAt: true },
    });
  }

  private async nextSortOrder(gymId: string) {
    const last = await this.prisma.gymImage.findFirst({
      where: { gymId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  private async assertImage(gymId: string, imageId: string) {
    if (
      !(await this.prisma.gymImage.findFirst({
        where: { id: imageId, gymId },
        select: { id: true },
      }))
    )
      throw new DomainException(
        ApiErrorCode.NOT_FOUND,
        'Gym image not found',
        HttpStatus.NOT_FOUND,
      );
  }
}
