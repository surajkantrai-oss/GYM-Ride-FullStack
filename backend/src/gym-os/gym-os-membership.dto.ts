import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  GymOsMembershipDurationType,
  GymOsMembershipPlanStatus,
  GymOsMembershipStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
export class CreateMembershipPlanDto {
  @ApiProperty() @IsString() @Length(2, 120) name!: string;
  @ApiProperty() @IsString() @Length(2, 50) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 1000) description?: string;
  @ApiProperty({ enum: GymOsMembershipDurationType })
  @IsEnum(GymOsMembershipDurationType)
  durationType!: GymOsMembershipDurationType;
  @ApiProperty() @IsInt() @Min(1) @Max(1200) durationValue!: number;
  @ApiProperty() @IsInt() @Min(0) priceMinor!: number;
  @ApiProperty({ default: 'INR' }) @IsString() @Length(3, 3) currency = 'INR';
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];
}
export class UpdateMembershipPlanDto extends PartialType(CreateMembershipPlanDto) {}
export class AssignMembershipDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() planId!: string;
  @ApiProperty() @IsDateString() startDate!: string;
}
export class MembershipReasonDto {
  @ApiProperty() @IsString() @Length(2, 500) reason!: string;
}
export class RenewMembershipDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() planId!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
}
export class MembershipListDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: GymOsMembershipStatus })
  @IsOptional()
  @IsEnum(GymOsMembershipStatus)
  status?: GymOsMembershipStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() memberId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryBucket?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gymId?: string;
}
export class MembershipPlanStatusDto {
  @ApiProperty({ enum: GymOsMembershipPlanStatus })
  @IsEnum(GymOsMembershipPlanStatus)
  status!: GymOsMembershipPlanStatus;
}
