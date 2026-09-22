import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { ReplaceOperatingHoursDto } from './dto/operating-hours.dto';
import { OperatingHoursService } from './operating-hours.service';

@ApiTags('Operating Hours')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner/branches/:branchId/operating-hours')
export class OperatingHoursController {
  constructor(private readonly hours: OperatingHoursService) {}
  @Get() get(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<unknown> {
    return this.hours.get(user, branchId);
  }
  @Put() replace(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: ReplaceOperatingHoursDto,
  ): Promise<unknown> {
    return this.hours.replace(user, branchId, dto.periods);
  }
}
