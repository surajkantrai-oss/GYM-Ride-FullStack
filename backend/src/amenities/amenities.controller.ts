import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { ReplaceAmenitiesDto } from './amenities.dto';
import { AmenitiesService } from './amenities.service';

@ApiTags('Amenities')
@Controller()
export class AmenitiesController {
  constructor(private readonly amenities: AmenitiesService) {}
  @Get('amenities') list(): Promise<unknown> {
    return this.amenities.list();
  }
  @Put('partner/branches/:branchId/amenities')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
  replace(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: ReplaceAmenitiesDto,
  ): Promise<unknown> {
    return this.amenities.replace(user, branchId, dto.amenityIds);
  }
}
