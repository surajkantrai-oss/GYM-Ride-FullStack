import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { VerifyCheckInOtpDto, VerifyCheckInQrDto } from './check-in.dto';
import { CheckInOtpService } from './check-in-otp.service';
import { CheckInTokenService } from './check-in-token.service';
import { CheckInVerificationService } from './check-in-verification.service';
import { CheckInService } from './check-in.service';
import {
  CheckInErrors,
  checkInStatusSchema,
  otpCredentialSchema,
  qrCredentialSchema,
  verificationSchema,
} from './check-in.swagger';

@ApiTags('customer-check-in')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.CUSTOMER)
@CheckInErrors()
@Controller('bookings/:bookingId/check-in')
export class CustomerCheckInsController {
  constructor(
    private readonly checkIns: CheckInService,
    private readonly tokens: CheckInTokenService,
    private readonly otps: CheckInOtpService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated customer booking check-in status and window' })
  @ApiOkResponse({
    description: 'Current server-authoritative check-in eligibility and lifecycle state',
    schema: checkInStatusSchema,
  })
  get(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<unknown> {
    return this.checkIns.getCustomer(user.id, bookingId);
  }

  @Post('qr')
  @ApiOperation({ summary: 'Issue a short-lived, single-use opaque QR check-in token' })
  @ApiCreatedResponse({
    description: 'Token and expiry; repeated calls revoke earlier unused tokens',
    schema: qrCredentialSchema,
  })
  @ApiConflictResponse({ description: 'Outside the check-in window or ineligible booking' })
  qr(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<unknown> {
    return this.tokens.issue(user.id, bookingId);
  }

  @Post('otp')
  @ApiOperation({ summary: 'Issue a short-lived in-app fallback check-in OTP' })
  @ApiCreatedResponse({
    description: 'Six-digit in-app OTP and expiry for the authenticated customer',
    schema: otpCredentialSchema,
  })
  @ApiTooManyRequestsResponse({ description: 'OTP cooldown or request limit exceeded' })
  otp(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<unknown> {
    return this.otps.issue(user.id, bookingId);
  }
}

@ApiTags('partner-check-in')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  RoleName.GYM_OWNER,
  RoleName.GYM_MANAGER,
  RoleName.GYM_STAFF,
  RoleName.ADMIN,
  RoleName.SUPER_ADMIN,
)
@CheckInErrors()
@Controller('partner/check-ins')
export class PartnerCheckInsController {
  constructor(private readonly verification: CheckInVerificationService) {}

  @Post('verify-qr')
  @ApiOperation({ summary: 'Verify a decoded QR token for an authorized branch' })
  @ApiOkResponse({
    description: 'Safe booking/customer identity and verified check-in state',
    schema: verificationSchema,
  })
  @ApiForbiddenResponse({ description: 'Partner is not authorized for the target branch' })
  verifyQr(@CurrentUser() user: AuthUser, @Body() body: VerifyCheckInQrDto): Promise<unknown> {
    return this.verification.verifyQr(user, body.token);
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify customer booking ID and fallback OTP for an authorized branch' })
  @ApiOkResponse({
    description: 'Safe booking/customer identity and verified check-in state',
    schema: verificationSchema,
  })
  @ApiForbiddenResponse({ description: 'Partner is not authorized for the target branch' })
  verifyOtp(@CurrentUser() user: AuthUser, @Body() body: VerifyCheckInOtpDto): Promise<unknown> {
    return this.verification.verifyOtp(user, body.bookingId, body.otp);
  }
}
