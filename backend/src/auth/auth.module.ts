import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OtpService } from './otp.service';
import { DevelopmentOtpProvider } from './providers/development-otp.provider';
import { OTP_PROVIDER } from './providers/otp-provider';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    DevelopmentOtpProvider,
    { provide: OTP_PROVIDER, useExisting: DevelopmentOtpProvider },
  ],
  exports: [JwtStrategy],
})
export class AuthModule {}
