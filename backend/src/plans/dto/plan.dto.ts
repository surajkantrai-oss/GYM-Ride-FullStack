import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PlanStatus, PlanType } from '@prisma/client';
import {
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiProperty({ enum: PlanType }) @IsEnum(PlanType) type!: PlanType;
  @ApiProperty({ description: 'Authoritative price in minor currency units (paise)' })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  priceMinor!: number;
  @ApiProperty({ default: 'INR' }) @Equals('INR') currency!: 'INR';
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10_000) visitLimit?: number;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  branchIds!: string[];
}

export class UpdatePlanDto extends PartialType(CreatePlanDto) {}

export class PlanListDto {
  @IsOptional() @IsEnum(PlanStatus) status?: PlanStatus;
}
