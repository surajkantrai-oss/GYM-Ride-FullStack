import { Module } from '@nestjs/common';
import { CheckInsModule } from '../check-ins/check-ins.module';
import { FinanceModule } from '../finance/finance.module';
import { GymAccessModule } from '../gym-access/gym-access.module';
import { AdminFlexController, CustomerFlexController, PartnerFlexController } from './flex.controller';
import { FlexService } from './flex.service';
import { FlexUsagePolicy } from './flex.policy';

@Module({
  imports: [FinanceModule, GymAccessModule, CheckInsModule],
  controllers: [CustomerFlexController, PartnerFlexController, AdminFlexController],
  providers: [FlexService, FlexUsagePolicy],
  exports: [FlexService],
})
export class FlexModule {}
