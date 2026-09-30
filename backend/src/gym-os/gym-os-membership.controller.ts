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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GymOsMembershipPlanStatus, RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import {
  AssignMembershipDto,
  CreateMembershipPlanDto,
  MembershipListDto,
  MembershipReasonDto,
  RenewMembershipDto,
  UpdateMembershipPlanDto,
} from './gym-os-membership.dto';
import { GymOsMembershipService } from './gym-os-membership.service';
@ApiTags('Partner GymOS Memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.GYM_STAFF)
@Controller('partner/gyms/:gymId/gym-os')
export class PartnerGymOsMembershipController {
  constructor(private readonly service: GymOsMembershipService) {}
  @Get('membership-plans')
  @ApiOperation({ summary: 'List gym membership plans (staff read-only)' })
  plans(@CurrentUser() u: AuthUser, @Param('gymId', ParseUUIDPipe) g: string) {
    return this.service.plans(u, g);
  }
  @Post('membership-plans')
  @ApiOperation({ summary: 'Create a draft membership plan' })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  createPlan(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Body() d: CreateMembershipPlanDto,
  ) {
    return this.service.createPlan(u, g, d);
  }
  @Get('membership-plans/:planId') @ApiOperation({ summary: 'Get a membership plan' }) plan(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('planId', ParseUUIDPipe) i: string,
  ) {
    return this.service.plan(u, g, i);
  }
  @Patch('membership-plans/:planId')
  @ApiOperation({
    summary: 'Edit a non-archived membership plan; existing snapshots stay immutable',
  })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  updatePlan(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('planId', ParseUUIDPipe) i: string,
    @Body() d: UpdateMembershipPlanDto,
  ) {
    return this.service.updatePlan(u, g, i, d);
  }
  @Post('membership-plans/:planId/activate')
  @ApiOperation({ summary: 'Activate a membership plan' })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  activate(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('planId', ParseUUIDPipe) i: string,
  ) {
    return this.service.planStatus(u, g, i, GymOsMembershipPlanStatus.ACTIVE);
  }
  @Post('membership-plans/:planId/deactivate')
  @ApiOperation({ summary: 'Deactivate a membership plan' })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  deactivate(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('planId', ParseUUIDPipe) i: string,
  ) {
    return this.service.planStatus(u, g, i, GymOsMembershipPlanStatus.INACTIVE);
  }
  @Post('membership-plans/:planId/archive')
  @ApiOperation({ summary: 'Archive a membership plan without deleting history' })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  archive(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('planId', ParseUUIDPipe) i: string,
  ) {
    return this.service.planStatus(u, g, i, GymOsMembershipPlanStatus.ARCHIVED);
  }
  @Post('members/:memberId/memberships')
  @ApiOperation({
    summary: 'Assign an active plan; dates, price, status and snapshots are server-derived',
  })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  assign(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('memberId', ParseUUIDPipe) m: string,
    @Body() d: AssignMembershipDto,
  ) {
    return this.service.assign(u, g, m, d);
  }
  @Get('members/:memberId/memberships')
  @ApiOperation({ summary: 'List immutable membership history and lifecycle events' })
  history(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('memberId', ParseUUIDPipe) m: string,
  ) {
    return this.service.memberHistory(u, g, m);
  }
  @Get('members/:memberId/memberships/current')
  @ApiOperation({ summary: 'Get the current active, frozen or scheduled membership' })
  async current(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('memberId', ParseUUIDPipe) m: string,
  ) {
    return (
      (await this.service.memberHistory(u, g, m)).find((x) =>
        ['ACTIVE', 'FROZEN', 'SCHEDULED'].includes(x.status),
      ) ?? null
    );
  }
  @Get('memberships/expiry-summary')
  @ApiOperation({ summary: 'Get exact and broad gym-local expiry buckets plus status totals' })
  expiry(@CurrentUser() u: AuthUser, @Param('gymId', ParseUUIDPipe) g: string) {
    return this.service.expirySummary(u, g);
  }
  @Get('memberships')
  @ApiOperation({
    summary: 'Search and filter memberships with bounded pagination and days remaining',
  })
  list(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: MembershipListDto,
  ) {
    return this.service.list(u, g, q);
  }
  @Post('memberships/:membershipId/freeze')
  @ApiOperation({ summary: 'Freeze an active membership with a reason' })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  freeze(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('membershipId', ParseUUIDPipe) i: string,
    @Body() d: MembershipReasonDto,
  ) {
    return this.service.freeze(u, g, i, d.reason);
  }
  @Post('memberships/:membershipId/resume')
  @ApiOperation({ summary: 'Resume once and extend end date by frozen days' })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  resume(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('membershipId', ParseUUIDPipe) i: string,
  ) {
    return this.service.resume(u, g, i);
  }
  @Post('memberships/:membershipId/cancel')
  @ApiOperation({ summary: 'Cancel an open membership with a reason; no payment or refund occurs' })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  cancel(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('membershipId', ParseUUIDPipe) i: string,
    @Body() d: MembershipReasonDto,
  ) {
    return this.service.cancel(u, g, i, d.reason);
  }
  @Post('memberships/:membershipId/renew')
  @ApiOperation({ summary: 'Create one linked renewal period without collecting payment' })
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
  renew(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('membershipId', ParseUUIDPipe) i: string,
    @Body() d: RenewMembershipDto,
  ) {
    return this.service.renew(u, g, i, d);
  }
}
@ApiTags('Admin GymOS Memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('admin/gym-os')
export class AdminGymOsMembershipController {
  constructor(private readonly service: GymOsMembershipService) {}
  @Get('membership-plans') @ApiOperation({ summary: 'Read-only GymOS membership plans' }) plans(
    @Query() q: MembershipListDto,
  ) {
    return this.service.adminPlans(q);
  }
  @Get('memberships') @ApiOperation({ summary: 'Read-only cross-gym membership list' }) memberships(
    @Query() q: MembershipListDto,
  ) {
    return this.service.adminMemberships(q);
  }
  @Get('memberships/:id')
  @ApiOperation({ summary: 'Read-only membership snapshot and lifecycle history' })
  membership(@Param('id', ParseUUIDPipe) i: string) {
    return this.service.adminMembership(i);
  }
}
