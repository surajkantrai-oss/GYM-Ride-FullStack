import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PlanType } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

const csv = ({ value }: { value: unknown }): string[] | undefined => typeof value === 'string' ? [...new Set(value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))] : undefined;

export class RecommendationQueryDto extends PaginationDto {
  @IsOptional() @IsLatitude() latitude?: string;
  @IsOptional() @IsLongitude() longitude?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) radiusKm?: number;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsEnum(PlanType) planType?: PlanType;
  @IsOptional() @Transform(csv) @IsArray() @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsDateString() desiredAt?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() flexOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) budgetMinMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) budgetMaxMinor?: number;
}

export class UpdateGymPreferenceDto {
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(80, { each: true }) preferredAmenities?: string[];
  @IsOptional() @IsEnum(PlanType) preferredPlanType?: PlanType | null;
  @IsOptional() @IsInt() @Min(0) @Max(23) preferredWorkoutHour?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(50) preferredRadiusKm?: number;
  @IsOptional() @IsInt() @Min(0) preferredBudgetMinMinor?: number | null;
  @IsOptional() @IsInt() @Min(0) preferredBudgetMaxMinor?: number | null;
}
