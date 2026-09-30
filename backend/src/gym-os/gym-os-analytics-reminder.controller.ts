/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { GymOsAnalyticsService } from './gym-os-analytics.service';
import {
  CreateGymOsReminderCampaignDto,
  GymOsCampaignListDto,
  GymOsCommunicationPreferenceDto,
  GymOsReminderListDto,
  ManualGymOsReminderDto,
  UpdateGymOsReminderRuleDto,
} from './gym-os-reminder.dto';
import { GymOsReminderService } from './gym-os-reminder.service';
import { GymOsAnalyticsRangeDto, GymOsSegmentDto } from './gym-os-analytics-range';
import { GymOsReminderCampaignService } from './gym-os-reminder-campaign.service';

@ApiTags('Partner GymOS Analytics and Reminders')
@ApiBearerAuth()
@ApiResponse({ status: 200, description: 'Gym-scoped response; no member contact is projected' })
@ApiResponse({ status: 201, description: 'Persistent reminder or campaign intent created' })
@ApiResponse({ status: 400, description: 'Invalid range, custom dates, status, or request body' })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 402, description: 'Required REPORTS or REMINDERS entitlement is inactive' })
@ApiResponse({ status: 403, description: 'Role or gym access denied' })
@ApiResponse({ status: 404, description: 'Gym-scoped resource not found' })
@ApiResponse({ status: 429, description: 'Stable reminder rate limit exceeded' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.GYM_STAFF)
@Controller('partner/gyms/:gymId/gym-os')
export class PartnerGymOsAnalyticsReminderController {
  constructor(
    private readonly analytics: GymOsAnalyticsService,
    private readonly reminders: GymOsReminderService,
    private readonly campaigns: GymOsReminderCampaignService,
  ) {}
  @Get('analytics/overview')
  @ApiOperation({
    summary: 'Authoritative GymOS operating dashboard aggregates for one bounded local-time range',
  })
  overview(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: GymOsAnalyticsRangeDto,
  ) {
    return this.analytics.overview(u, g, q);
  }
  @Get('analytics/renewals')
  @ApiOperation({ summary: 'Retention cohorts; renewal rate is renewed eligible expiries / eligible expiries' })
  renewals(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: GymOsAnalyticsRangeDto,
  ) {
    return this.analytics.renewals(u, g, q);
  }
  @Get('analytics/attendance')
  @ApiOperation({ summary: 'Attendance counts, unique visitors, average visits, busiest local weekday/hour, and frequency buckets' })
  attendance(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: GymOsAnalyticsRangeDto,
  ) {
    return this.analytics.attendance(u, g, q);
  }
  @Get('analytics/segments')
  @ApiOperation({ summary: 'Bounded server-defined inactivity or new-member-no-visit segment' })
  segments(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: GymOsSegmentDto,
  ) {
    return this.analytics.segments(u, g, q);
  }
  @Get('analytics/branches')
  @ApiOperation({ summary: 'Authoritative branch attendance/member comparison; finance attribution is explicitly unavailable' })
  branches(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: GymOsAnalyticsRangeDto,
  ) {
    return this.analytics.branches(u, g, q);
  }
  @Get('reminders/rules')
  @ApiOperation({ summary: 'List server-owned reminder rules and local send/quiet-hour settings' })
  rules(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
  ) {
    return this.reminders.rules(u, g);
  }
  @Patch('reminders/rules/:id')
  @ApiOperation({ summary: 'Owner/manager updates a reminder rule; staff remains read-only' })
  rule(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) i: string,
    @Body() d: UpdateGymOsReminderRuleDto,
  ) {
    return this.reminders.updateRule(u, g, i, d);
  }
  @Get('reminders/deliveries')
  @ApiOperation({ summary: 'Paginated SCHEDULED, PROCESSING, SENT, FAILED, SKIPPED, or CANCELLED delivery history' })
  deliveries(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: GymOsReminderListDto,
  ) {
    return this.reminders.deliveries(u, g, q);
  }
  @Post('reminders/manual')
  @ApiOperation({ summary: 'Create a rate-limited server-template reminder; quiet hours may return a future SCHEDULED intent' })
  manual(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Body() d: ManualGymOsReminderDto,
  ) {
    return this.reminders.manual(u, g, d);
  }
  @Post('reminders/evaluate')
  @ApiOperation({ summary: 'Authorized local-development fallback that creates deduplicated intents without external sends' })
  evaluate(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
  ) {
    return this.reminders.rules(u, g).then(() => this.reminders.evaluate(g));
  }
  @Post('reminders/campaigns/preview')
  @ApiOperation({ summary: 'Read-only server-segment preview with eligible, opted-out, and contact-missing counts' })
  previewCampaign(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Body() d: CreateGymOsReminderCampaignDto,
  ) {
    return this.campaigns.preview(u, g, d);
  }
  @Post('reminders/campaigns')
  @ApiOperation({ summary: 'Schedule a future operational campaign using gym-local quiet-hour enforcement' })
  createCampaign(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Body() d: CreateGymOsReminderCampaignDto,
  ) {
    return this.campaigns.create(u, g, d);
  }
  @Get('reminders/campaigns')
  @ApiOperation({ summary: 'List campaigns, lifecycle status, and terminal delivery counts' })
  listCampaigns(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: GymOsCampaignListDto,
  ) {
    return this.campaigns.list(u, g, q);
  }
  @Post('reminders/campaigns/:id/cancel')
  @ApiOperation({ summary: 'Cancel an owned DRAFT or SCHEDULED campaign without deleting history' })
  cancelCampaign(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) i: string,
  ) {
    return this.campaigns.cancel(u, g, i);
  }
  @Get('members/:memberId/communication-preferences')
  @ApiOperation({ summary: 'Read gym-scoped transactional/marketing channel preferences' })
  preference(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('memberId', ParseUUIDPipe) m: string,
  ) {
    return this.reminders.preference(u, g, m);
  }
  @Patch('members/:memberId/communication-preferences')
  @ApiOperation({ summary: 'Update a gym-scoped member communication preference with audit history' })
  updatePreference(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('memberId', ParseUUIDPipe) m: string,
    @Body() d: GymOsCommunicationPreferenceDto,
  ) {
    return this.reminders.updatePreference(u, g, m, d);
  }
}
@ApiTags('Admin GymOS Analytics and Reminders')
@ApiBearerAuth()
@ApiResponse({ status: 200, description: 'Read-only platform oversight response without member contacts' })
@ApiResponse({ status: 400, description: 'Invalid filters or range' })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Admin role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('admin/gym-os')
export class AdminGymOsAnalyticsReminderController {
  constructor(
    private readonly analytics: GymOsAnalyticsService,
    private readonly reminders: GymOsReminderService,
    private readonly campaigns: GymOsReminderCampaignService,
  ) {}
  @Get('analytics/:gymId')
  @ApiOperation({ summary: 'Read-only Admin analytics oversight for one gym and bounded period' })
  overview(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: GymOsAnalyticsRangeDto,
  ) {
    return this.analytics.overview(u, g, q);
  }
  @Get('reminders/deliveries')
  @ApiOperation({ summary: 'Read-only delivery status/provider oversight; contact values are not returned' })
  deliveries(
    @Query() q: GymOsReminderListDto,
    @Query('gymId') g?: string,
  ) {
    return this.reminders.adminDeliveries(q, g);
  }
  @Get('reminders/campaigns')
  @ApiOperation({ summary: 'Read-only campaign lifecycle and delivery-count oversight' })
  campaignList(
    @Query() q: GymOsCampaignListDto,
    @Query('gymId') g?: string,
  ) {
    return this.campaigns.admin(q, g);
  }
}
