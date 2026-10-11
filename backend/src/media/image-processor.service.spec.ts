import { ConfigService } from '@nestjs/config';
import * as sharpModule from 'sharp';
import { ImageProcessorService } from './image-processor.service';

const sharp = sharpModule as unknown as typeof import('sharp').default;

function upload(buffer: Buffer, mimetype: string): Express.Multer.File {
  return {
    buffer,
    size: buffer.length,
    mimetype,
    originalname: `test.${mimetype.split('/')[1]}`,
    fieldname: 'file',
    encoding: '7bit',
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}

describe('ImageProcessorService', () => {
  const service = new ImageProcessorService({
    get: (_key: string, fallback: number) => fallback,
  } as ConfigService);

  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)('accepts and normalizes a valid %s upload', async (format, mimetype) => {
    const pipeline = sharp({
      create: { width: 24, height: 18, channels: 3, background: '#08795a' },
    });
    const buffer = await pipeline[format]().toBuffer();

    await expect(service.gymImage(upload(buffer, mimetype), false)).resolves.toMatchObject({
      mimeType: 'image/webp',
      width: 24,
      height: 18,
    });
  });

  it('rejects content that is not an image', async () => {
    await expect(
      service.gymImage(upload(Buffer.from('not an image'), 'image/png'), false),
    ).rejects.toMatchObject({ status: 422 });
  });
});
