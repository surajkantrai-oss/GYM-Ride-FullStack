import { GymImageKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class UploadGymImageDto {
  @IsOptional() @IsEnum(GymImageKind) kind: GymImageKind = GymImageKind.GALLERY;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateGymImageDto {
  @IsOptional() @IsEnum(GymImageKind) kind?: GymImageKind;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}
