import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GymOsReminderCampaignSegment,
  GymOsReminderCampaignStatus,
  GymOsReminderChannel,
  GymOsReminderDeliveryStatus,
  GymOsReminderType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateGymOsReminderRuleDto {
  @ApiPropertyOptional({ enum: GymOsReminderChannel })
  @IsOptional()
  @IsEnum(GymOsReminderChannel)
  channel?: GymOsReminderChannel;
  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  offsetDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  sendTime?: string;
  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietStart?: string;
  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietEnd?: string;
}
export class ManualGymOsReminderDto {
  @ApiProperty() @IsUUID() memberId!: string;
  @ApiProperty({ enum: GymOsReminderType }) @IsEnum(GymOsReminderType) type!: GymOsReminderType;
  @ApiProperty({ enum: GymOsReminderChannel })
  @IsEnum(GymOsReminderChannel)
  channel!: GymOsReminderChannel;
  @ApiProperty() @IsString() @IsUUID() subjectId!: string;
}
export class GymOsCommunicationPreferenceDto {
  @ApiProperty({ description: 'Required operational communication consent' })
  @IsBoolean() allowTransactional!: boolean;
  @ApiProperty({ description: 'Optional promotional communication consent' })
  @IsBoolean() allowMarketing!: boolean;
  @ApiProperty()
  @IsBoolean() allowWhatsApp!: boolean;
  @ApiProperty()
  @IsBoolean() allowSms!: boolean;
  @ApiProperty()
  @IsBoolean() allowEmail!: boolean;
}
export class GymOsReminderListDto {
  @ApiPropertyOptional({ enum: GymOsReminderDeliveryStatus })
  @IsOptional() @IsEnum(GymOsReminderDeliveryStatus) status?: GymOsReminderDeliveryStatus;
  @ApiPropertyOptional({ enum: GymOsReminderType })
  @IsOptional() @IsEnum(GymOsReminderType) type?: GymOsReminderType;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() memberId?: string;
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}
export class CreateGymOsReminderCampaignDto {
  @ApiProperty() @IsString() @Matches(/^[^<>]{3,160}$/) name!: string;
  @ApiProperty({ enum: GymOsReminderType }) @IsEnum(GymOsReminderType) type!: GymOsReminderType;
  @ApiProperty({ enum: GymOsReminderChannel })
  @IsEnum(GymOsReminderChannel)
  channel!: GymOsReminderChannel;
  @ApiProperty({ enum: GymOsReminderCampaignSegment })
  @IsEnum(GymOsReminderCampaignSegment)
  segment!: GymOsReminderCampaignSegment;
  @ApiProperty() @IsDateString() scheduledFor!: string;
}
export class GymOsCampaignListDto {
  @ApiPropertyOptional({ enum: GymOsReminderCampaignStatus })
  @IsOptional() @IsEnum(GymOsReminderCampaignStatus) status?: GymOsReminderCampaignStatus;
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}
