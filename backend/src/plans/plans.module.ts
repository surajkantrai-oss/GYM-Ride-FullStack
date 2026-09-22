import { Module } from '@nestjs/common';
import {
  AdminPlansController,
  PartnerPlansController,
  PublicPlansController,
} from './plans.controller';
import { PlansService } from './plans.service';
@Module({
  controllers: [PartnerPlansController, PublicPlansController, AdminPlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
