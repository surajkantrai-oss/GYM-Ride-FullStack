/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GymMemberStatus, RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { AdminGymOsMemberListDto, CreateGymOsMemberDto, GymOsMemberImportDto, GymOsMemberListDto, UpdateGymOsMemberDto } from './gym-os-member.dto';
import { GymOsMemberService } from './gym-os-member.service';

@ApiTags('Partner GymOS Members') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.GYM_STAFF)
@Controller('partner/gyms/:gymId/gym-os/members')
export class PartnerGymOsMemberController {
  constructor(private readonly members: GymOsMemberService) {}
  @Get('summary') @ApiOperation({ summary: 'Get entitled gym member usage and plan limit' }) summary(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string) { return this.members.summary(user, gymId); }
  @Get() @ApiOperation({ summary: 'List entitled gym members with bounded pagination' }) list(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Query() query: GymOsMemberListDto) { return this.members.list(user, gymId, query); }
  @Post() @ApiOperation({ summary: 'Create a direct GymOS member; owner/manager only' }) create(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Body() dto: CreateGymOsMemberDto) { return this.members.create(user, gymId, dto); }
  @Post('import/preview') @ApiOperation({ summary: 'Validate a bounded UTF-8 member CSV without persistence' }) preview(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Body() dto: GymOsMemberImportDto) { return this.members.previewImport(user, gymId, dto); }
  @Post('import') @ApiOperation({ summary: 'Atomically import a previously previewable member CSV' }) importCsv(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Body() dto: GymOsMemberImportDto) { return this.members.importMembers(user, gymId, dto); }
  @Get(':memberId') detail(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Param('memberId', ParseUUIDPipe) memberId: string) { return this.members.detail(user, gymId, memberId); }
  @Patch(':memberId') update(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body() dto: UpdateGymOsMemberDto) { return this.members.update(user, gymId, memberId, dto); }
  @Post(':memberId/deactivate') deactivate(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Param('memberId', ParseUUIDPipe) memberId: string) { return this.members.transition(user, gymId, memberId, GymMemberStatus.INACTIVE); }
  @Post(':memberId/reactivate') reactivate(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Param('memberId', ParseUUIDPipe) memberId: string) { return this.members.transition(user, gymId, memberId, GymMemberStatus.ACTIVE); }
  @Post(':memberId/archive') archive(@CurrentUser() user: AuthUser, @Param('gymId', ParseUUIDPipe) gymId: string, @Param('memberId', ParseUUIDPipe) memberId: string) { return this.members.transition(user, gymId, memberId, GymMemberStatus.ARCHIVED); }
}

@ApiTags('Admin GymOS Members') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN) @Controller('admin/gym-os/members')
export class AdminGymOsMemberController {
  constructor(private readonly members: GymOsMemberService) {}
  @Get() @ApiOperation({ summary: 'Read-only cross-gym GymOS member directory' }) list(@Query() query: AdminGymOsMemberListDto) { return this.members.adminList(query); }
  @Get(':memberId') @ApiOperation({ summary: 'Read-only minimal GymOS member detail' }) detail(@Param('memberId', ParseUUIDPipe) memberId: string) { return this.members.adminDetail(memberId); }
}
