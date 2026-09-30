import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GymOsMemberChargeStatus, GymOsMemberPaymentMethod, GymOsMemberPaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class RecordMemberPaymentDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() chargeId!: string;
  @ApiProperty() @IsInt() @Min(1) amountMinor!: number;
  @ApiProperty({ enum: GymOsMemberPaymentMethod }) @IsEnum(GymOsMemberPaymentMethod) method!: GymOsMemberPaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paidAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 160) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 1000) notes?: string;
}
export class ReverseMemberPaymentDto {
  @ApiProperty() @IsString() @Length(2, 500) reason!: string;
}
export class MemberFinanceListDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() memberId?: string;
  @ApiPropertyOptional({ enum: GymOsMemberChargeStatus }) @IsOptional() @IsEnum(GymOsMemberChargeStatus) chargeStatus?: GymOsMemberChargeStatus;
  @ApiPropertyOptional({ enum: GymOsMemberPaymentMethod }) @IsOptional() @IsEnum(GymOsMemberPaymentMethod) method?: GymOsMemberPaymentMethod;
  @ApiPropertyOptional({ enum: GymOsMemberPaymentStatus }) @IsOptional() @IsEnum(GymOsMemberPaymentStatus) paymentStatus?: GymOsMemberPaymentStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dueBucket?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gymId?: string;
}
