import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { GymMemberStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateGymOsMemberDto {
  @ApiProperty() @IsString() @Length(1, 100) firstName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) lastName?: string;
  @ApiProperty({ example: '+919876543210' }) @IsString() phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() primaryBranchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() joinedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateOfBirth?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 160) emergencyContactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyContactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 255) addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 20) postalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 2) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 2000) notes?: string;
}
export class UpdateGymOsMemberDto extends PartialType(CreateGymOsMemberDto) {}
export class GymOsMemberListDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: GymMemberStatus }) @IsOptional() @IsEnum(GymMemberStatus) status?: GymMemberStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() createdFrom?: string;
  @ApiPropertyOptional({ default: 'createdAt' }) @IsOptional() @IsString() sort?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}
export class GymOsMemberImportDto {
  @ApiProperty({ description: 'UTF-8 CSV text, maximum 1,000 data rows and 1 MB' }) @IsString() csv!: string;
}
export class AdminGymOsMemberListDto extends GymOsMemberListDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() gymId?: string;
}
