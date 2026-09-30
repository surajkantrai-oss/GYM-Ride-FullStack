import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { GymAccessModule } from '../gym-access/gym-access.module';
import { AdminGymOsController, PartnerGymOsController } from './gym-os.controller';
import { GymOsEntitlementService } from './gym-os-entitlement.service';
import { GymOsLifecycleService } from './gym-os-lifecycle.service';
import { GymOsService } from './gym-os.service';
import {
  AdminGymOsMemberController,
  PartnerGymOsMemberController,
} from './gym-os-member.controller';
import { GymOsMemberService } from './gym-os-member.service';
import {
  AdminGymOsMembershipController,
  PartnerGymOsMembershipController,
} from './gym-os-membership.controller';
import { GymOsMembershipService } from './gym-os-membership.service';
import {
  AdminGymOsAttendanceController,
  PartnerGymOsAttendanceController,
  PartnerGymOsMemberAttendanceController,
} from './gym-os-attendance.controller';
import { GymOsAttendanceService } from './gym-os-attendance.service';
import { AdminGymOsMemberFinanceController, PartnerGymOsMemberFinanceController } from './gym-os-member-finance.controller';
import { GymOsMemberFinanceService } from './gym-os-member-finance.service';
import { GymOsAnalyticsService } from './gym-os-analytics.service';
import { AdminGymOsAnalyticsReminderController, PartnerGymOsAnalyticsReminderController } from './gym-os-analytics-reminder.controller';
import { GymOsReminderService } from './gym-os-reminder.service';
import { DevelopmentGymOsMessagingProvider } from './providers/gym-os-messaging.provider';
import { GymOsAnalyticsRangeResolver } from './gym-os-analytics-range';
import { GymOsReminderTimeService } from './gym-os-reminder-time.service';
import { GymOsReminderCampaignService } from './gym-os-reminder-campaign.service';
import { GymOsReminderJobsService } from './gym-os-reminder-jobs.service';

@Module({
  imports: [FinanceModule, GymAccessModule],
  controllers: [
    PartnerGymOsController,
    AdminGymOsController,
    PartnerGymOsMemberController,
    AdminGymOsMemberController,
    PartnerGymOsMembershipController,
    AdminGymOsMembershipController,
    PartnerGymOsAttendanceController,
    PartnerGymOsMemberAttendanceController,
    AdminGymOsAttendanceController,
    PartnerGymOsMemberFinanceController,
    AdminGymOsMemberFinanceController,
    PartnerGymOsAnalyticsReminderController,
    AdminGymOsAnalyticsReminderController,
  ],
  providers: [
    GymOsService,
    GymOsEntitlementService,
    GymOsLifecycleService,
    GymOsMemberService,
    GymOsMembershipService,
    GymOsAttendanceService,
    GymOsMemberFinanceService,
    GymOsAnalyticsService,
    GymOsAnalyticsRangeResolver,
    GymOsReminderTimeService,
    GymOsReminderCampaignService,
    GymOsReminderJobsService,
    GymOsReminderService,
    { provide: 'GYMOS_MESSAGING_PROVIDER', useClass: DevelopmentGymOsMessagingProvider },
  ],
  exports: [GymOsEntitlementService],
})
export class GymOsModule {}
