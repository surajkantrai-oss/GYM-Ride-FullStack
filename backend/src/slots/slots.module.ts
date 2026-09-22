import { Module } from '@nestjs/common';
import { PartnerSlotsController, PublicSlotsController } from './slots.controller';
import { SlotsService } from './slots.service';
@Module({
  controllers: [PartnerSlotsController, PublicSlotsController],
  providers: [SlotsService],
  exports: [SlotsService],
})
export class SlotsModule {}
