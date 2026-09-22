import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsString } from 'class-validator';

class ExampleDto {
  @IsEmail() email!: string;
  @IsString() name!: string;
}

describe('global validation policy', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata = { type: 'body' as const, metatype: ExampleDto, data: undefined };

  it('rejects malformed and unknown fields', async () => {
    await expect(
      pipe.transform({ email: 'invalid', name: 'Test', elevated: true }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transforms valid payloads to DTOs', async () => {
    const result: unknown = await pipe.transform(
      { email: 'member@example.com', name: 'Member' },
      metadata,
    );
    expect(result).toBeInstanceOf(ExampleDto);
  });
});
