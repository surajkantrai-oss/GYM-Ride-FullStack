import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { PrismaService } from '../database/prisma.service';
import { UpdateProfileDto } from './users.dto';
import { ImageProcessorService } from '../media/image-processor.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageProcessorService,
  ) {}
  async me(id: string): Promise<unknown> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user)
      throw new DomainException(
        ApiErrorCode.USER_NOT_FOUND,
        'User not found',
        HttpStatus.NOT_FOUND,
      );
    return this.view(user);
  }
  async update(id: string, dto: UpdateProfileDto): Promise<unknown> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: { ...dto, email: dto.email?.trim().toLowerCase() },
        include: { roles: { include: { role: true } } },
      });
      return this.view(user);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new DomainException(
          ApiErrorCode.EMAIL_ALREADY_EXISTS,
          'Email is already in use',
          HttpStatus.CONFLICT,
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new DomainException(
          ApiErrorCode.USER_NOT_FOUND,
          'User not found',
          HttpStatus.NOT_FOUND,
        );
      throw error;
    }
  }
  async updatePhoto(id: string, file: Express.Multer.File): Promise<unknown> {
    const image = await this.images.profilePhoto(file);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        profilePhotoData: image.data,
        profilePhotoMimeType: image.mimeType,
        profilePhotoUpdatedAt: new Date(),
      },
      include: { roles: { include: { role: true } } },
    });
    return this.view(user);
  }
  async removePhoto(id: string): Promise<unknown> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        profilePhotoData: null,
        profilePhotoMimeType: null,
        profilePhotoUpdatedAt: null,
      },
      include: { roles: { include: { role: true } } },
    });
    return this.view(user);
  }
  private view(user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    profilePhotoData: Uint8Array<ArrayBufferLike> | null;
    profilePhotoMimeType: string | null;
    profilePhotoUpdatedAt: Date | null;
    status: string;
    roles: { role: { name: string } }[];
  }): unknown {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: user.roles.map(({ role }) => role.name),
      avatarUrl:
        user.profilePhotoData && user.profilePhotoMimeType
          ? `data:${user.profilePhotoMimeType};base64,${Buffer.from(user.profilePhotoData).toString('base64')}`
          : null,
      profilePhotoUpdatedAt: user.profilePhotoUpdatedAt,
    };
  }
}
