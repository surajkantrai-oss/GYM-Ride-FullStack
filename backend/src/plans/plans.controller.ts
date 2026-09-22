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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlanStatus, RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { CreatePlanDto, PlanListDto, UpdatePlanDto } from './dto/plan.dto';
import { PlansService } from './plans.service';

@ApiTags('Partner Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner')
export class PartnerPlansController {
  constructor(private readonly plans: PlansService) {}
  @Post('gyms/:gymId/plans') create(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: CreatePlanDto,
  ): Promise<unknown> {
    return this.plans.create(user, gymId, dto);
  }
  @Get('gyms/:gymId/plans') list(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Query() query: PlanListDto,
  ): Promise<unknown> {
    return this.plans.list(user, gymId, query);
  }
  @Get('plans/:planId') get(
    @CurrentUser() user: AuthUser,
    @Param('planId', ParseUUIDPipe) planId: string,
  ): Promise<unknown> {
    return this.plans.get(user, planId);
  }
  @Patch('plans/:planId') update(
    @CurrentUser() user: AuthUser,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<unknown> {
    return this.plans.update(user, planId, dto);
  }
  @Post('plans/:planId/activate') activate(
    @CurrentUser() user: AuthUser,
    @Param('planId', ParseUUIDPipe) planId: string,
  ): Promise<unknown> {
    return this.plans.setStatus(user, planId, PlanStatus.ACTIVE);
  }
  @Post('plans/:planId/deactivate') deactivate(
    @CurrentUser() user: AuthUser,
    @Param('planId', ParseUUIDPipe) planId: string,
  ): Promise<unknown> {
    return this.plans.setStatus(user, planId, PlanStatus.INACTIVE);
  }
}

@ApiTags('Public Plans')
@Controller()
export class PublicPlansController {
  constructor(private readonly plans: PlansService) {}
  @Get('gyms/:gymId/plans')
  gym(@Param('gymId', ParseUUIDPipe) gymId: string): Promise<unknown[]> {
    return this.plans.publicForGym(gymId);
  }
  @Get('branches/:branchId/plans')
  branch(@Param('branchId', ParseUUIDPipe) branchId: string): Promise<unknown[]> {
    return this.plans.publicForBranch(branchId);
  }
}

@ApiTags('Admin Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('admin')
export class AdminPlansController {
  constructor(private readonly plans: PlansService) {}
  @Get('gyms/:gymId/plans') list(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Query() query: PlanListDto,
  ): Promise<unknown> {
    return this.plans.list(user, gymId, query);
  }
  @Get('plans/:planId') get(
    @CurrentUser() user: AuthUser,
    @Param('planId', ParseUUIDPipe) planId: string,
  ): Promise<unknown> {
    return this.plans.get(user, planId);
  }
}
