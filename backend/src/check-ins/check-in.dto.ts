import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyCheckInQrDto {
  @ApiProperty({ description: 'Opaque short-lived token decoded from the customer QR' })
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  token!: string;
}

export class VerifyCheckInOtpDto {
  @ApiProperty({ format: 'uuid', description: 'Booking reference shown by the customer' })
  @IsUUID()
  bookingId!: string;

  @ApiProperty({ pattern: '^\\d{6}$', description: 'Six-digit in-app fallback code' })
  @Matches(/^\d{6}$/)
  otp!: string;
}
