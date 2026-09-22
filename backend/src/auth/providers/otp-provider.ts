export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

export interface OtpProvider {
  send(phone: string, otp: string): Promise<{ developmentOtp?: string }>;
}
