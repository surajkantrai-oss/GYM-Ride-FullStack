import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@ApiTags('Partner Branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}
  @Post('gyms/:gymId/branches')
  @Roles(RoleName.GYM_OWNER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
  create(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: CreateBranchDto,
  ): Promise<unknown> {
    return this.branches.create(user, gymId, dto);
  }
  @Get('gyms/:gymId/branches') list(
    @CurrentUser() user: AuthUser,
    @Param('gymId', ParseUUIDPipe) gymId: string,
  ): Promise<unknown> {
    return this.branches.list(user, gymId);
  }
  @Get('branches/:branchId') get(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<unknown> {
    return this.branches.get(user, branchId);
  }
  @Patch('branches/:branchId') update(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchDto,
  ): Promise<unknown> {
    return this.branches.update(user, branchId, dto);
  }
}
