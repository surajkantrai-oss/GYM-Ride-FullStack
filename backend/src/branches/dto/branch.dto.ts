import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BranchStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsTimeZone,
  Length,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateBranchDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(255) address!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) city!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) state!: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(20) postalCode!: string;
  @ApiProperty({ default: 'IN' }) @IsString() @Length(2, 2) country!: string;
  @ApiProperty() @IsLatitude() latitude!: string;
  @ApiProperty() @IsLongitude() longitude!: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @ApiProperty({ default: 'Asia/Kolkata' })
  @IsTimeZone()
  @Matches(/^[A-Za-z_]+\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?$/)
  timezone!: string;
}
export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @ApiPropertyOptional() @IsOptional() @IsEnum(BranchStatus) status?: BranchStatus;
}
