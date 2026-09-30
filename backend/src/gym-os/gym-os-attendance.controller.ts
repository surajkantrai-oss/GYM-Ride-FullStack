/* eslint-disable @typescript-eslint/explicit-function-return-type */
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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import {
  AttendanceCheckInDto,
  AttendanceListDto,
  AttendanceQrCheckInDto,
} from './gym-os-attendance.dto';
import { GymOsAttendanceService } from './gym-os-attendance.service';

@ApiTags('Partner GymOS Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.GYM_STAFF)
@Controller('partner/gyms/:gymId/gym-os/attendance')
export class PartnerGymOsAttendanceController {
  constructor(private readonly service: GymOsAttendanceService) {}
  @Post('check-in')
  @ApiOperation({ summary: 'Manually check in an eligible direct member' })
  checkIn(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Body() d: AttendanceCheckInDto,
  ) {
    return this.service.checkIn(u, g, d);
  }
  @Post(':attendanceId/check-out')
  @ApiOperation({ summary: 'Close one open attendance session' })
  checkOut(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('attendanceId', ParseUUIDPipe) id: string,
  ) {
    return this.service.checkOut(u, g, id);
  }
  @Post('branches/:branchId/qr')
  @ApiOperation({ summary: 'Generate a 256-bit, short-lived branch QR gate token' })
  qr(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('branchId', ParseUUIDPipe) b: string,
  ) {
    return this.service.qrToken(u, g, b);
  }
  @Post('qr/check-in')
  @ApiOperation({
    summary:
      'Staff-authenticated QR attendance check-in; rotating QR is reusable by distinct members',
  })
  qrCheckIn(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Body() d: AttendanceQrCheckInDto,
  ) {
    return this.service.qrCheckIn(u, g, d);
  }
  @Get('summary')
  @ApiOperation({ summary: 'Gym-local today, present, 7-day and 30-day attendance summary' })
  summary(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query('branchId') b?: string,
  ) {
    return this.service.summary(u, g, b);
  }
  @Get('today') today(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query('branchId') b?: string,
  ) {
    return this.service.summary(u, g, b);
  }
  @Get('present') present(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query('branchId') b?: string,
  ) {
    return this.service.present(u, g, b);
  }
  @Get()
  @ApiOperation({
    summary: 'Paginated attendance history with member, branch, date, method and status filters',
  })
  list(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Query() q: AttendanceListDto,
  ) {
    return this.service.list(u, g, q);
  }
}

@ApiTags('Partner GymOS Member Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.GYM_STAFF)
@Controller('partner/gyms/:gymId/gym-os/members/:memberId/attendance')
export class PartnerGymOsMemberAttendanceController {
  constructor(private readonly service: GymOsAttendanceService) {}
  @Get() @ApiOperation({ summary: 'Attendance history for one gym-scoped member' }) history(
    @CurrentUser() u: AuthUser,
    @Param('gymId', ParseUUIDPipe) g: string,
    @Param('memberId', ParseUUIDPipe) m: string,
    @Query() q: AttendanceListDto,
  ) {
    return this.service.memberHistory(u, g, m, q);
  }
}

@ApiTags('Admin GymOS Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('admin/gym-os/attendance')
export class AdminGymOsAttendanceController {
  constructor(private readonly service: GymOsAttendanceService) {}
  @Get() @ApiOperation({ summary: 'Read-only cross-gym attendance history' }) list(
    @Query() q: AttendanceListDto,
  ) {
    return this.service.adminList(q);
  }
  @Get('summary') @ApiOperation({ summary: 'Read-only attendance summary for one gym' }) summary(
    @Query('gymId', ParseUUIDPipe) g: string,
    @Query('branchId') b?: string,
  ) {
    return this.service.adminSummary(g, b);
  }
}
