/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { GymImagesService } from './gym-images.service';
import { UpdateGymImageDto, UploadGymImageDto } from './gym-images.dto';

@ApiTags('Partner Gym Images')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner/gyms/:gymId/images')
export class PartnerGymImagesController {
  constructor(private readonly images: GymImagesService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: UploadGymImageDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.images.upload(user, gymId, dto, file);
  }

  @Patch(':imageId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() dto: UpdateGymImageDto,
  ) {
    return this.images.update(user, gymId, imageId, dto);
  }

  @Delete(':imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.images.remove(user, gymId, imageId);
  }
}

@ApiTags('Gym Media')
@Controller('media/gym-images')
export class GymImageContentController {
  constructor(private readonly images: GymImagesService) {}

  @Get(':imageId')
  async content(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const image = await this.images.content(imageId);
    if (!image)
      throw new DomainException(
        ApiErrorCode.NOT_FOUND,
        'Gym image not found',
        HttpStatus.NOT_FOUND,
      );
    response.set({
      'Content-Type': image.mimeType,
      'Cache-Control': 'public, max-age=86400, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      ETag: `"${image.updatedAt.getTime()}"`,
    });
    return new StreamableFile(image.data);
  }
}
