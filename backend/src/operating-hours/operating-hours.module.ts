import { Module } from '@nestjs/common';
import { OperatingHoursController } from './operating-hours.controller';
import { OperatingHoursService } from './operating-hours.service';

@Module({ controllers: [OperatingHoursController], providers: [OperatingHoursService] })
export class OperatingHoursModule {}
