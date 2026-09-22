import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GymListDto } from './dto/gym.dto';
import { NearbyGymsDto } from './dto/nearby.dto';
import { PublicGymsService } from './public-gyms.service';

@ApiTags('Public Gyms')
@Controller()
export class PublicGymsController {
  constructor(private readonly gyms: PublicGymsService) {}
  @Get('gyms') list(@Query() query: GymListDto): Promise<unknown> {
    return this.gyms.list(query);
  }
  @Get('gyms/nearby') nearby(@Query() query: NearbyGymsDto): Promise<unknown> {
    return this.gyms.nearby(query);
  }
  @Get('gyms/:gymId') gym(@Param('gymId', ParseUUIDPipe) gymId: string): Promise<unknown> {
    return this.gyms.getGym(gymId);
  }
  @Get('branches/:branchId') branch(
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<unknown> {
    return this.gyms.getBranch(branchId);
  }
}
