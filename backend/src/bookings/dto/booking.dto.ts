import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateBookingDto {
  @ApiProperty() @IsUUID() planId!: string;
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() slotId?: string;
}

export class BookingListDto extends PaginationDto {
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
}

export class ManagedBookingListDto extends BookingListDto {
  @IsOptional() @IsUUID() gymId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsDateString({ strict: true }) date?: string;
}

export class IdempotencyHeaderDto {
  @IsString() @MinLength(8) @MaxLength(120) value!: string;
}
