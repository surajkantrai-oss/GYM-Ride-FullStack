import { Module } from '@nestjs/common';
import { AdminGymsController } from './admin-gyms.controller';
import { AdminGymsService } from './admin-gyms.service';

@Module({ controllers: [AdminGymsController], providers: [AdminGymsService] })
export class AdminModule {}
