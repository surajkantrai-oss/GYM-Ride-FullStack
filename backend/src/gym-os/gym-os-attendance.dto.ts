import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GymOsAttendanceMethod, GymOsAttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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

export class AttendanceCheckInDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() memberId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() branchId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 500) reason?: string;
}
export class AttendanceQrCheckInDto extends AttendanceCheckInDto {
  @ApiProperty() @IsString() @Length(20, 500) token!: string;
}
export class AttendanceListDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() memberId?: string;
  @ApiPropertyOptional({ enum: GymOsAttendanceStatus })
  @IsOptional()
  @IsEnum(GymOsAttendanceStatus)
  status?: GymOsAttendanceStatus;
  @ApiPropertyOptional({ enum: GymOsAttendanceMethod })
  @IsOptional()
  @IsEnum(GymOsAttendanceMethod)
  method?: GymOsAttendanceMethod;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gymId?: string;
}
