import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class NearbyGymsDto extends PaginationDto {
  @IsLatitude() latitude!: string;
  @IsLongitude() longitude!: string;
  @Type(() => Number) @IsNumber() @Min(0.1) @Max(50) radiusKm = 5;
  @IsOptional() @IsString() amenities?: string;
}
