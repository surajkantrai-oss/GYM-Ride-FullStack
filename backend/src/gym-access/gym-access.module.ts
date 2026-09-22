import { Global, Module } from '@nestjs/common';
import { GymAccessService } from './gym-access.service';

@Global()
@Module({ providers: [GymAccessService], exports: [GymAccessService] })
export class GymAccessModule {}
