import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { OtpProvider } from './otp-provider';
import { DomainException } from '../../common/errors/domain.exception';
import { ApiErrorCode } from '../../common/errors/api-error-code';

@Injectable()
export class DevelopmentOtpProvider implements OtpProvider {
  constructor(private readonly config: ConfigService) {}
  send(_phone: string, otp: string): Promise<{ developmentOtp?: string }> {
    if (this.config.get<string>('NODE_ENV') !== 'development') {
      throw new DomainException(
        ApiErrorCode.SERVICE_UNAVAILABLE,
        'An OTP delivery provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return Promise.resolve({ developmentOtp: otp });
  }
}
