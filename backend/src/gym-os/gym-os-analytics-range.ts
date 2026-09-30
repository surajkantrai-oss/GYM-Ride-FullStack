import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DateTime } from 'luxon';

export enum GymOsAnalyticsRange { TODAY='TODAY', LAST_7_DAYS='LAST_7_DAYS', LAST_30_DAYS='LAST_30_DAYS', THIS_MONTH='THIS_MONTH', LAST_MONTH='LAST_MONTH', CUSTOM='CUSTOM' }
export enum GymOsMemberSegment { NO_VISIT_7_DAYS='NO_VISIT_7_DAYS', NO_VISIT_14_DAYS='NO_VISIT_14_DAYS', NO_VISIT_30_DAYS='NO_VISIT_30_DAYS', NEW_MEMBER_NO_VISIT_7_DAYS='NEW_MEMBER_NO_VISIT_7_DAYS' }
export class GymOsAnalyticsRangeDto {
  @ApiPropertyOptional({enum:GymOsAnalyticsRange,default:GymOsAnalyticsRange.LAST_30_DAYS}) @IsOptional() @IsEnum(GymOsAnalyticsRange) range:GymOsAnalyticsRange=GymOsAnalyticsRange.LAST_30_DAYS;
  @ApiPropertyOptional({example:'2026-09-01'}) @IsOptional() @IsDateString() from?:string;
  @ApiPropertyOptional({example:'2026-09-30'}) @IsOptional() @IsDateString() to?:string;
}
export class GymOsSegmentDto extends GymOsAnalyticsRangeDto { @ApiPropertyOptional({enum:GymOsMemberSegment}) @IsOptional() @IsEnum(GymOsMemberSegment) segment:GymOsMemberSegment=GymOsMemberSegment.NO_VISIT_7_DAYS; @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=100; }
export interface ResolvedAnalyticsRange {range:GymOsAnalyticsRange;from:Date;toExclusive:Date;fromLocal:string;toLocal:string;timezone:string;}
@Injectable()
export class GymOsAnalyticsRangeResolver {
 resolve(timezone:string,input:GymOsAnalyticsRangeDto,now=DateTime.now()):ResolvedAnalyticsRange {const localNow=now.setZone(timezone),today=localNow.startOf('day');let from:DateTime,to:DateTime;switch(input.range){case GymOsAnalyticsRange.TODAY:from=today;to=localNow;break;case GymOsAnalyticsRange.LAST_7_DAYS:from=today.minus({days:6});to=localNow;break;case GymOsAnalyticsRange.THIS_MONTH:from=localNow.startOf('month');to=localNow;break;case GymOsAnalyticsRange.LAST_MONTH:from=localNow.minus({months:1}).startOf('month');to=localNow.startOf('month');break;case GymOsAnalyticsRange.CUSTOM:{if(!input.from||!input.to)throw new BadRequestException('CUSTOM range requires from and to');from=DateTime.fromISO(input.from,{zone:timezone}).startOf('day');to=DateTime.fromISO(input.to,{zone:timezone}).plus({days:1}).startOf('day');if(!from.isValid||!to.isValid||from>=to)throw new BadRequestException('Invalid custom analytics range');if(to.diff(from,'days').days>366)throw new BadRequestException('Custom analytics range cannot exceed 366 days');break;}default:from=today.minus({days:29});to=localNow;}return{range:input.range,from:from.toUTC().toJSDate(),toExclusive:to.toUTC().toJSDate(),fromLocal:from.toISO()??'',toLocal:to.toISO()??'',timezone};}
}
