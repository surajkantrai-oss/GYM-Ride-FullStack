import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { AdminGymListDto, ReviewReasonDto } from '../gyms/dto/gym.dto';
import { AdminGymsService } from './admin-gyms.service';

@ApiTags('Admin Gyms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('admin/gyms')
export class AdminGymsController {
  constructor(private readonly gyms: AdminGymsService) {}
  @Get() list(@Query() query: AdminGymListDto): Promise<unknown> {
    return this.gyms.list(query);
  }
  @Get('summary') summary(): Promise<unknown> {
    return this.gyms.summary();
  }
  @Get(':gymId/audit') audit(@Param('gymId', ParseUUIDPipe) gymId: string): Promise<unknown> {
    return this.gyms.audit(gymId);
  }
  @Get(':gymId') get(@Param('gymId', ParseUUIDPipe) gymId: string): Promise<unknown> {
    return this.gyms.get(gymId);
  }
  @Post(':gymId/approve') approve(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
  ): Promise<unknown> {
    return this.gyms.approve(user, gymId);
  }
  @Post(':gymId/reject') reject(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: ReviewReasonDto,
  ): Promise<unknown> {
    return this.gyms.reject(user, gymId, dto.reason);
  }
  @Post(':gymId/suspend') suspend(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: ReviewReasonDto,
  ): Promise<unknown> {
    return this.gyms.suspend(user, gymId, dto.reason);
  }
  @Post(':gymId/reactivate') reactivate(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
  ): Promise<unknown> {
    return this.gyms.reactivate(user, gymId);
  }
}
