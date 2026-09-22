import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../common/dto/pagination.dto';

export class ReconciliationQueryDto {
  @ApiPropertyOptional({
    description: 'Payment cursor returned by the previous reconciliation page',
  })
  @IsOptional()
  @IsUUID()
  after?: string;
  @ApiPropertyOptional({
    description: 'Independent settlement scan cursor returned as nextSettlementCursor',
  })
  @IsOptional()
  @IsUUID()
  afterSettlement?: string;
}

export class VerifyPaymentDto {
  @ApiProperty() @IsString() @MaxLength(1000) orderId!: string;
  @ApiProperty() @IsString() @MaxLength(2000) paymentId!: string;
  @ApiProperty() @IsString() @MaxLength(128) signature!: string;
}
export class RefundRequestDto {
  @ApiProperty() @IsUUID() paymentId!: string;
  @ApiProperty({ description: 'Refund in paise, bounded by captured balance' })
  @IsInt()
  @Min(1)
  @Max(100000000)
  amount!: number;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() override?: boolean;
}
export class SettlementRequestDto {
  @ApiProperty() @IsUUID() gymId!: string;
  @ApiProperty() @IsDateString() start!: string;
  @ApiProperty() @IsDateString() end!: string;
}
export class SettlementReversalDto {
  @ApiProperty({
    description: 'Reason for a verified payout correction; does not initiate a bank transfer',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
export class FinanceQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() gymId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() bookingId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([
    'CREATED',
    'PENDING',
    'AUTHORIZED',
    'SUCCESS',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
    'PROCESSING',
    'READY',
    'PAID',
    'REVERSED',
  ])
  status?: string;
}
