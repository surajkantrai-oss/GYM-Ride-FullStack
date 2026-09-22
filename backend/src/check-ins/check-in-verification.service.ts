import { Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../common/types/auth-user';
import { GymAccessService } from '../gym-access/gym-access.service';
import { CheckInOtpService } from './check-in-otp.service';
import { CheckInTokenService } from './check-in-token.service';
import { CheckInService } from './check-in.service';

@Injectable()
export class CheckInVerificationService {
  private readonly logger = new Logger(CheckInVerificationService.name);
  constructor(
    private readonly access: GymAccessService,
    private readonly tokens: CheckInTokenService,
    private readonly otps: CheckInOtpService,
    private readonly checkIns: CheckInService,
  ) {}

  async verifyQr(user: AuthUser, token: string): Promise<unknown> {
    const target = await this.tokens.inspect(token);
    await this.access.assertBranchCheckIn(user, target.branchId);
    const bookingId = await this.tokens.verify(token, user.id);
    this.logger.log(
      { bookingId, branchId: target.branchId, verifierUserId: user.id, method: 'QR' },
      'Check-in verified',
    );
    return this.checkIns.verificationView(bookingId);
  }

  async verifyOtp(user: AuthUser, bookingId: string, code: string): Promise<unknown> {
    const target = await this.otps.inspect(bookingId);
    await this.access.assertBranchCheckIn(user, target.branchId);
    await this.otps.verify(bookingId, code, user.id);
    this.logger.log(
      { bookingId, branchId: target.branchId, verifierUserId: user.id, method: 'OTP' },
      'Check-in verified',
    );
    return this.checkIns.verificationView(bookingId);
  }
}
