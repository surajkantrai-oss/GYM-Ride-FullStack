import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { GymImageContentController } from './gym-images.controller';
import type { GymImagesService } from './gym-images.service';

describe('GymImageContentController', () => {
  it('allows public images to render from the web applications origin', async () => {
    const updatedAt = new Date('2026-10-10T00:00:00.000Z');
    const images = {
      content: jest.fn().mockResolvedValue({
        data: Buffer.from('image'),
        mimeType: 'image/webp',
        updatedAt,
      }),
    } as unknown as GymImagesService;
    const set = jest.fn();
    const controller = new GymImageContentController(images);

    const result = await controller.content('d66b3e45-b145-4e13-b97e-f02df1ebd8e9', {
      set,
    } as unknown as Response);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'image/webp',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      }),
    );
  });
});
