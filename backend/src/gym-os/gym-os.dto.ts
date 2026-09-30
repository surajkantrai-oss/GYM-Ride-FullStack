import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GymOsBillingInterval, GymOsFeature, GymOsPlanStatus, GymOsSubscriptionStatus } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateGymOsPlanDto {
  @ApiProperty({ example: 'GYMOS_STARTER' }) @IsString() @Length(3, 50) code!: string;
  @ApiProperty() @IsString() @Length(2, 100) name!: string;
  @ApiProperty() @IsString() @Length(2, 2000) description!: string;
  @ApiProperty({ enum: GymOsBillingInterval }) @IsEnum(GymOsBillingInterval) billingInterval!: GymOsBillingInterval;
  @ApiProperty({ description: 'Price in minor currency units' }) @IsInt() @Min(1) priceMinor!: number;
  @ApiProperty({ example: 'INR' }) @IsString() @Length(3, 3) currency!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(365) trialDays!: number;
  @ApiProperty() @IsInt() @Min(1) memberLimit!: number;
  @ApiProperty() @IsInt() @Min(1) branchLimit!: number;
  @ApiProperty({ enum: GymOsFeature, isArray: true }) @IsArray() @IsEnum(GymOsFeature, { each: true }) features!: GymOsFeature[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class UpdateGymOsPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) priceMinor?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) memberLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) branchLimit?: number;
  @ApiPropertyOptional({ enum: GymOsFeature, isArray: true }) @IsOptional() @IsArray() @IsEnum(GymOsFeature, { each: true }) features?: GymOsFeature[];
}

export class SubscribeGymOsDto {
  @ApiProperty({ format: 'uuid' }) @IsString() planId!: string;
}
export class VerifyGymOsPaymentDto {
  @ApiProperty() @IsString() orderId!: string;
  @ApiProperty() @IsString() providerPaymentId!: string;
  @ApiProperty() @IsString() signature!: string;
}
export class SuspendGymOsDto {
  @ApiProperty() @IsString() @Length(5, 1000) reason!: string;
}
export class GymOsListDto {
  @ApiPropertyOptional({ enum: GymOsSubscriptionStatus }) @IsOptional() @IsEnum(GymOsSubscriptionStatus) status?: GymOsSubscriptionStatus;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsString() planId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gymId?: string;
}
export class GymOsPlanStatusDto {
  @ApiProperty({ enum: GymOsPlanStatus }) @IsEnum(GymOsPlanStatus) status!: GymOsPlanStatus;
}
