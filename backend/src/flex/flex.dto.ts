import { ApiProperty, PartialType } from '@nestjs/swagger';
import { FlexPlanStatus, PlanType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { PaginationDto } from '../common/dto/pagination.dto';

export class PurchaseFlexDto {
  @ApiProperty() @IsUUID() planId!: string;
  @ApiProperty() @IsUUID() primaryCityId!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() secondaryCityId?: string;
}
export class VerifyFlexPaymentDto {
  @IsString() orderId!: string;
  @IsString() providerPaymentId!: string;
  @IsString() signature!: string;
}
export class CreateFlexBookingDto {
  @IsUUID() branchId!: string;
  @IsUUID() planId!: string;
  @IsUUID() slotId!: string;
}
export class FlexListDto extends PaginationDto {
  @IsOptional() @IsUUID() gymId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsString() status?: string;
}
export class UpsertCityDto {
  @IsString() @Length(2, 80) code!: string;
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(2, 120) state!: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateCityDto extends PartialType(UpsertCityDto) {}
export class CreateFlexPlanDto {
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(2, 80) code!: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsInt() @Min(1) priceMinor!: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(366) durationDays!: number;
  @Type(() => Number) @IsInt() @Min(1) totalUsageLimit!: number;
  @Type(() => Number) @IsInt() @Min(0) primaryCityLimit!: number;
  @Type(() => Number) @IsInt() @Min(0) secondaryCityLimit!: number;
  @Type(() => Number) @IsInt() @Min(1) dailyUsageLimit!: number;
  @Type(() => Number) @IsInt() @Min(1) bookingAdvanceDays!: number;
  @IsArray() @ArrayNotEmpty() @IsEnum(PlanType, { each: true }) eligiblePlanTypes!: PlanType[];
  @IsOptional() @IsEnum(FlexPlanStatus) status?: FlexPlanStatus;
}
export class UpdateFlexPlanDto extends PartialType(CreateFlexPlanDto) {}
export class ParticipationDto {
  @IsUUID() branchId!: string;
  @IsUUID() serviceCityId!: string;
  @IsBoolean() enabled!: boolean;
  @IsArray() @ArrayNotEmpty() @IsEnum(PlanType, { each: true }) allowedPlanTypes!: PlanType[];
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
export class ReimbursementDto {
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsString() @Length(1, 40) version!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
