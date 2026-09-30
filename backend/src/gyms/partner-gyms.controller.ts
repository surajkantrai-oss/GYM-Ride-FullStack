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
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { CreateGymDto, PartnerGymListDto, UpdateGymDto } from './dto/gym.dto';
import { PartnerGymsService } from './partner-gyms.service';

@ApiTags('Partner Gyms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.GYM_STAFF, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner/gyms')
export class PartnerGymsController {
  constructor(private readonly gyms: PartnerGymsService) {}
  @Post() @Roles(RoleName.CUSTOMER, RoleName.GYM_OWNER, RoleName.ADMIN, RoleName.SUPER_ADMIN) create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateGymDto,
  ): Promise<unknown> {
    return this.gyms.create(user, dto);
  }
  @Get() list(@CurrentUser() user: AuthUser, @Query() query: PartnerGymListDto): Promise<unknown> {
    return this.gyms.list(user, query);
  }
  @Get('summary') summary(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.gyms.summary(user);
  }
  @Get(':gymId') get(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
  ): Promise<unknown> {
    return this.gyms.get(user, gymId);
  }
  @Patch(':gymId') @Roles(RoleName.GYM_OWNER, RoleName.ADMIN, RoleName.SUPER_ADMIN) update(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: UpdateGymDto,
  ): Promise<unknown> {
    return this.gyms.update(user, gymId, dto);
  }
  @Post(':gymId/submit') @Roles(RoleName.GYM_OWNER, RoleName.ADMIN, RoleName.SUPER_ADMIN) submit(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
  ): Promise<unknown> {
    return this.gyms.submit(user, gymId);
  }
}
