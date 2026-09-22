import { ApiProperty } from '@nestjs/swagger';
import { Weekday } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OperatingPeriodDto {
  @ApiProperty({ enum: Weekday }) @IsEnum(Weekday) weekday!: Weekday;
  @ApiProperty() @IsBoolean() isClosed!: boolean;
  @ApiProperty({ example: '06:00', required: false })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  opensAt?: string;
  @ApiProperty({ example: '12:00', required: false })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closesAt?: string;
}
export class ReplaceOperatingHoursDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OperatingPeriodDto)
  periods!: OperatingPeriodDto[];
}
