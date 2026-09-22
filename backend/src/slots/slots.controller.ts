import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { AvailabilityExceptionDto, AvailabilityQueryDto, SlotConfigDto } from './dto/slot.dto';
import { SlotsService } from './slots.service';

@ApiTags('Partner Availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner/branches/:branchId')
export class PartnerSlotsController {
  constructor(private readonly slots: SlotsService) {}
  @Get('slot-config') config(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<unknown> {
    return this.slots.getConfig(user, branchId);
  }
  @Put('slot-config') putConfig(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: SlotConfigDto,
  ): Promise<unknown> {
    return this.slots.putConfig(user, branchId, dto);
  }
  @Get('availability') availability(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: AvailabilityQueryDto,
  ): Promise<unknown[]> {
    return this.slots.partnerAvailability(user, branchId, query.date, query.planId);
  }
  @Get('availability-exceptions') exceptions(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<unknown[]> {
    return this.slots.listExceptions(user, branchId);
  }
  @Put('availability-exceptions') putException(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: AvailabilityExceptionDto,
  ): Promise<unknown> {
    return this.slots.upsertException(user, branchId, dto);
  }
}

@ApiTags('Availability')
@Controller('branches/:branchId/availability')
export class PublicSlotsController {
  constructor(private readonly slots: SlotsService) {}
  @Get() get(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: AvailabilityQueryDto,
  ): Promise<unknown[]> {
    return this.slots.publicAvailability(branchId, query.date, query.planId);
  }
}
