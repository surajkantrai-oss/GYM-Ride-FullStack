import { Body, Controller, Get, Headers, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { CreateFlexBookingDto, CreateFlexPlanDto, FlexListDto, ParticipationDto, PurchaseFlexDto, ReimbursementDto, UpdateCityDto, UpdateFlexPlanDto, UpsertCityDto, VerifyFlexPaymentDto } from './flex.dto';
import { FlexService } from './flex.service';

function requiredKey(key?: string): string {
  if (!key || key.length < 8 || key.length > 120) throw new DomainException(ApiErrorCode.VALIDATION_FAILED, 'Idempotency-Key must contain 8 to 120 characters', HttpStatus.BAD_REQUEST);
  return key;
}

@ApiTags('Flex')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.CUSTOMER)
@Controller('flex')
export class CustomerFlexController {
  constructor(private readonly flex: FlexService) {}
  @Get('cities') cities(): Promise<unknown> { return this.flex.cities(); }
  @Get('plans') plans(): Promise<unknown> { return this.flex.plans(); }
  @Get('subscription') subscription(@CurrentUser() user: AuthUser): Promise<unknown> { return this.flex.subscription(user.id); }
  @Get('usage') usage(@CurrentUser() user: AuthUser, @Query() q: FlexListDto): Promise<unknown> { return this.flex.usage(user.id, q); }
  @Get('gyms') gyms(@CurrentUser() user: AuthUser, @Query('cityId') cityId?: string): Promise<unknown> { return this.flex.eligibleGyms(user.id, cityId); }
  @Post('subscriptions') @ApiHeader({ name: 'Idempotency-Key', required: true }) purchase(@CurrentUser() user: AuthUser, @Body() dto: PurchaseFlexDto, @Headers('idempotency-key') key?: string): Promise<unknown> { return this.flex.purchase(user.id, dto, requiredKey(key)); }
  @Post('payments/:paymentId/verify') verify(@CurrentUser() user: AuthUser, @Param('paymentId', ParseUUIDPipe) id: string, @Body() dto: VerifyFlexPaymentDto): Promise<unknown> { return this.flex.verify(user.id, id, dto.orderId, dto.providerPaymentId, dto.signature); }
  @Post('payments/:paymentId/simulate') simulate(@CurrentUser() user: AuthUser, @Param('paymentId', ParseUUIDPipe) id: string): Promise<unknown> { return this.flex.simulate(user.id, id); }
  @Post('bookings') @ApiHeader({ name: 'Idempotency-Key', required: true }) booking(@CurrentUser() user: AuthUser, @Body() dto: CreateFlexBookingDto, @Headers('idempotency-key') key?: string): Promise<unknown> { return this.flex.createBooking(user.id, dto, requiredKey(key)); }
  @Post('bookings/:bookingId/cancel') cancel(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) id: string): Promise<unknown> { return this.flex.cancelBooking(user.id, id); }
}

@ApiTags('Partner Flex')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner/flex')
export class PartnerFlexController {
  constructor(private readonly flex: FlexService) {}
  @Get('summary') summary(@CurrentUser() user: AuthUser, @Query() q: FlexListDto): Promise<unknown> { return this.flex.partnerSummary(user, q); }
  @Get('bookings') bookings(@CurrentUser() user: AuthUser, @Query() q: FlexListDto): Promise<unknown> { return this.flex.partnerList(user, q, 'bookings'); }
  @Get('usage') usage(@CurrentUser() user: AuthUser, @Query() q: FlexListDto): Promise<unknown> { return this.flex.partnerList(user, q, 'usage'); }
  @Get('earnings') earnings(@CurrentUser() user: AuthUser, @Query() q: FlexListDto): Promise<unknown> { return this.flex.partnerList(user, q, 'earnings'); }
  @Get('cities') cities(): Promise<unknown> { return this.flex.cities(); }
  @Get('gyms/:gymId/participation') getParticipation(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string): Promise<unknown> { return this.flex.getParticipation(user, gymId); }
  @Patch('gyms/:gymId/participation') participation(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Body() dto: ParticipationDto): Promise<unknown> { return this.flex.setParticipation(user, gymId, dto); }
}

@ApiTags('Admin Flex')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('admin/flex')
export class AdminFlexController {
  constructor(private readonly flex: FlexService) {}
  @Get('summary') summary(): Promise<unknown> { return this.flex.adminSummary(); }
  @Get('subscriptions') subscriptions(@Query() q: FlexListDto): Promise<unknown> { return this.flex.adminList(q, 'subscriptions'); }
  @Get('usage') usage(@Query() q: FlexListDto): Promise<unknown> { return this.flex.adminList(q, 'usage'); }
  @Get('participations') participations(@Query() q: FlexListDto): Promise<unknown> { return this.flex.adminList(q, 'participations'); }
  @Get('cities') cities(): Promise<unknown> { return this.flex.cities(); }
  @Get('plans') plans(): Promise<unknown> { return this.flex.adminPlans(); }
  @Post('cities') city(@CurrentUser() user: AuthUser, @Body() dto: UpsertCityDto): Promise<unknown> { return this.flex.createCity(user.id, dto); }
  @Patch('cities/:id') updateCity(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCityDto): Promise<unknown> { return this.flex.updateCity(user.id, id, dto); }
  @Post('plans') plan(@CurrentUser() user: AuthUser, @Body() dto: CreateFlexPlanDto): Promise<unknown> { return this.flex.createPlan(user.id, dto); }
  @Patch('plans/:id') updatePlan(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFlexPlanDto): Promise<unknown> { return this.flex.updatePlan(user.id, id, dto); }
  @Post('participations/:id/reimbursement-rules') rule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReimbursementDto): Promise<unknown> { return this.flex.createRule(user.id, id, dto); }
}
