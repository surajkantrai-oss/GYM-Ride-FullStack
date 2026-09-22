import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityExceptionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SlotConfigDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(15) @Max(180) slotDurationMinutes!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(1000) defaultCapacity!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(90) bookingWindowDays!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(43_200) minimumAdvanceMinutes!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-09-07' }) @IsDateString({ strict: true }) date!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() planId?: string;
}

export class AvailabilityExceptionDto {
  @ApiProperty({ example: '2026-10-02' }) @IsDateString({ strict: true }) date!: string;
  @ApiProperty({ enum: AvailabilityExceptionType })
  @IsEnum(AvailabilityExceptionType)
  type!: AvailabilityExceptionType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isClosed?: boolean;
}
