import { Module } from '@nestjs/common';
import { PartnerGymsController } from './partner-gyms.controller';
import { PartnerGymsService } from './partner-gyms.service';
import { PublicGymsController } from './public-gyms.controller';
import { PublicGymsService } from './public-gyms.service';

@Module({
  controllers: [PartnerGymsController, PublicGymsController],
  providers: [PartnerGymsService, PublicGymsService],
})
export class GymsModule {}
