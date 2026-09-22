import { Body, Controller, HttpCode, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser } from '../common/types/auth-user';
import { AuthService } from './auth.service';
import { RefreshDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request a short-lived phone OTP' })
  requestOtp(@Body() dto: RequestOtpDto, @Ip() ip: string): Promise<unknown> {
    return this.auth.requestOtp(dto.phone, ip);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify OTP and create an authenticated session' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() request: Request): Promise<unknown> {
    return this.auth.verifyOtp(dto.phone, dto.otp, {
      deviceName: dto.deviceName,
      userAgent: request.header('user-agent'),
    });
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<unknown> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logout(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.auth.logout(user);
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logoutAll(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.auth.logoutAll(user.id);
  }
}
