/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sharpModule from 'sharp';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';

const inputFormats = new Set(['jpeg', 'png', 'webp']);
const sharp = sharpModule as unknown as typeof import('sharp').default;

@Injectable()
export class ImageProcessorService {
  constructor(private readonly config: ConfigService) {}

  async gymImage(file: Express.Multer.File, cover: boolean) {
    this.validateSize(file);
    return this.process(file.buffer, cover ? 1800 : 1600, cover ? 1000 : 1400, cover);
  }

  async profilePhoto(file: Express.Multer.File) {
    this.validateSize(file);
    return this.process(file.buffer, 384, 384, true);
  }

  private validateSize(file?: Express.Multer.File) {
    if (!file?.buffer?.length)
      throw new DomainException(
        ApiErrorCode.VALIDATION_FAILED,
        'Choose an image to upload',
        HttpStatus.BAD_REQUEST,
      );
    const max = this.config.get<number>('MEDIA_UPLOAD_MAX_BYTES', 8_388_608);
    if (file.size > max)
      throw new DomainException(
        ApiErrorCode.VALIDATION_FAILED,
        `Image must be smaller than ${Math.ceil(max / 1_048_576)} MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
  }

  private async process(buffer: Buffer, width: number, height: number, crop: boolean) {
    try {
      const options = { failOn: 'error' as const };
      const metadata = await sharp(buffer, options).metadata();
      if (!metadata.format || !inputFormats.has(metadata.format)) throw new Error('format');
      const output = sharp(buffer, options)
        .rotate()
        .resize(width, height, {
          fit: crop ? 'cover' : 'inside',
          withoutEnlargement: true,
          position: 'attention',
        })
        .webp({ quality: 84 });
      const { data, info } = await output.toBuffer({ resolveWithObject: true });
      return { data, mimeType: 'image/webp', width: info.width, height: info.height };
    } catch (error) {
      if (error instanceof DomainException) throw error;
      throw new DomainException(
        ApiErrorCode.VALIDATION_FAILED,
        'Upload a valid JPEG, PNG or WebP image',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
