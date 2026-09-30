/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Body, Controller, Get, Headers, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GymOsPlanStatus, RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { CreateGymOsPlanDto, GymOsListDto, GymOsPlanStatusDto, SubscribeGymOsDto, SuspendGymOsDto, UpdateGymOsPlanDto, VerifyGymOsPaymentDto } from './gym-os.dto';
import { GymOsEntitlementService } from './gym-os-entitlement.service';
import { GymOsService } from './gym-os.service';

function key(value?: string): string {
  if (!value || value.length < 8 || value.length > 120) throw new DomainException(ApiErrorCode.VALIDATION_FAILED, 'Idempotency-Key must contain 8 to 120 characters', HttpStatus.BAD_REQUEST);
  return value;
}

@ApiTags('Partner GymOS') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner')
export class PartnerGymOsController {
  constructor(private readonly gymOs: GymOsService, private readonly entitlements: GymOsEntitlementService) {}
  @Get('gym-os/plans') @ApiOperation({ summary: 'List active GymOS plans and authoritative feature matrix' }) plans() { return this.gymOs.plans(); }
  @Get('gyms/:gymId/gym-os/subscription') subscription(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string) { return this.gymOs.subscription(user, gymId); }
  @Get('gyms/:gymId/gym-os/entitlements') async entitlement(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string) { await this.gymOs.subscription(user, gymId); return this.entitlements.getEffectiveEntitlements(gymId); }
  @Post('gyms/:gymId/gym-os/subscribe') @ApiHeader({ name: 'Idempotency-Key', required: true, description: '8–120 characters; retries return the same logical purchase' }) subscribe(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Body() dto: SubscribeGymOsDto, @Headers('idempotency-key') idempotency?: string) { return this.gymOs.subscribe(user, gymId, dto.planId, key(idempotency)); }
  @Post('gyms/:gymId/gym-os/payments/:paymentId/verify') verify(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Body() dto: VerifyGymOsPaymentDto) { return this.gymOs.verify(user, gymId, paymentId, dto.orderId, dto.providerPaymentId, dto.signature); }
  @Post('gyms/:gymId/gym-os/payments/:paymentId/simulate') simulate(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string) { return this.gymOs.simulate(user, gymId, paymentId); }
  @Post('gyms/:gymId/gym-os/cancel') cancel(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string) { return this.gymOs.cancel(user, gymId); }
}

@ApiTags('Admin GymOS') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN) @Controller('admin/gym-os')
export class AdminGymOsController {
  constructor(private readonly gymOs: GymOsService) {}
  @Get('summary') summary() { return this.gymOs.adminSummary(); }
  @Get('plans') plans() { return this.gymOs.plans(false); }
  @Post('plans') create(@CurrentUser() user: AuthUser, @Body() dto: CreateGymOsPlanDto) { return this.gymOs.createPlan(user.id, dto); }
  @Patch('plans/:id') update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGymOsPlanDto) { return this.gymOs.updatePlan(user.id, id, dto); }
  @Post('plans/:id/status') status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GymOsPlanStatusDto) { return this.gymOs.setPlanStatus(user.id, id, dto.status); }
  @Post('plans/:id/activate') activate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.gymOs.setPlanStatus(user.id, id, GymOsPlanStatus.ACTIVE); }
  @Post('plans/:id/deactivate') deactivate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.gymOs.setPlanStatus(user.id, id, GymOsPlanStatus.INACTIVE); }
  @Get('subscriptions') subscriptions(@Query() q: GymOsListDto) { return this.gymOs.adminSubscriptions(q); }
  @Get('subscriptions/:id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.gymOs.adminDetail(id); }
  @Post('subscriptions/:id/activate') @ApiOperation({ summary: 'Activate a paid or valid-trial GymOS subscription after Admin review' }) activateSubscription(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.gymOs.activateSubscription(user.id, id); }
  @Post('subscriptions/:id/suspend') suspend(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendGymOsDto) { return this.gymOs.suspend(user.id, id, dto.reason); }
  @Post('reconcile') reconcile() { return this.gymOs.reconcile(); }
}
