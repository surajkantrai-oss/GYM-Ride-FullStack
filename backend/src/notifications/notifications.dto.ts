import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { NotificationCategory } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class NotificationListDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : value)
  @IsBoolean()
  unread?: boolean;
}

export class NotificationPreferenceDto {
  @ApiProperty({ enum: NotificationCategory })
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}

export class RegisterPushDeviceDto {
  @ApiProperty({ enum: ['ios', 'android'] })
  @Matches(/^(ios|android)$/)
  platform!: string;

  @ApiProperty({ description: 'Expo push token; never included in responses' })
  @IsString()
  @Matches(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/)
  token!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Own device ID for token rotation' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}
