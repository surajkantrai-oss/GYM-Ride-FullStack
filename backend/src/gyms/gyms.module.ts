import { Module } from '@nestjs/common';
import { PartnerGymsController } from './partner-gyms.controller';
import { PartnerGymsService } from './partner-gyms.service';
import { PublicGymsController } from './public-gyms.controller';
import { PublicGymsService } from './public-gyms.service';
import { MediaModule } from '../media/media.module';
import { GymImageContentController, PartnerGymImagesController } from './gym-images.controller';
import { GymImagesService } from './gym-images.service';

@Module({
  imports: [MediaModule],
  controllers: [
    PartnerGymsController,
    PublicGymsController,
    PartnerGymImagesController,
    GymImageContentController,
  ],
  providers: [PartnerGymsService, PublicGymsService, GymImagesService],
})
export class GymsModule {}
