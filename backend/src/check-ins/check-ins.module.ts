import { Module } from '@nestjs/common';
import { CustomerCheckInsController, PartnerCheckInsController } from './check-ins.controller';
import { CheckInLifecycleService } from './check-in-lifecycle.service';
import { CheckInOtpService } from './check-in-otp.service';
import { CheckInPolicy } from './check-in.policy';
import { CheckInService } from './check-in.service';
import { CheckInTokenService } from './check-in-token.service';
import { CheckInVerificationService } from './check-in-verification.service';

@Module({
  controllers: [CustomerCheckInsController, PartnerCheckInsController],
  providers: [
    CheckInPolicy,
    CheckInService,
    CheckInTokenService,
    CheckInOtpService,
    CheckInVerificationService,
    CheckInLifecycleService,
  ],
  exports: [CheckInService, CheckInLifecycleService],
})
export class CheckInsModule {}
