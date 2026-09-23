import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ReviewStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class ReviewInputDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  comment?: string;
}

export class ReviewListDto extends PaginationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  gymId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class AdminReviewListDto extends ReviewListDto {
  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class ModerateReviewDto {
  @ApiProperty({ enum: ReviewStatus })
  @IsEnum(ReviewStatus)
  status!: ReviewStatus;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Transform(trim)
  reason!: string;
}
