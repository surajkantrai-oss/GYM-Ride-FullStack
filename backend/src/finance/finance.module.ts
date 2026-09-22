import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GymAccessModule } from '../gym-access/gym-access.module';
import {
  AdminFinanceController,
  CustomerPaymentsController,
  PartnerFinanceController,
  PaymentWebhooksController,
} from './finance.controller';
import { FinanceQueriesService } from './finance-queries.service';
import { CommissionService, RefundPolicy } from './finance-policy';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { SettlementsService } from './settlements.service';
import { ReconciliationService } from './reconciliation.service';
import { PaymentProvider } from './providers/payment-provider';
import { DevelopmentPaymentProvider } from './providers/development-payment.provider';
import { RazorpayPaymentProvider } from './providers/razorpay-payment.provider';
import { DevelopmentPayoutProvider, PayoutProvider } from './providers/payout-provider';
import { CheckInsModule } from '../check-ins/check-ins.module';

@Module({
  imports: [GymAccessModule, CheckInsModule],
  controllers: [
    AdminFinanceController,
    CustomerPaymentsController,
    PartnerFinanceController,
    PaymentWebhooksController,
  ],
  providers: [
    PaymentsService,
    RefundsService,
    SettlementsService,
    ReconciliationService,
    FinanceQueriesService,
    CommissionService,
    RefundPolicy,
    {
      provide: PaymentProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProvider =>
        config.get<string>('PAYMENT_PROVIDER') === 'razorpay'
          ? new RazorpayPaymentProvider(
              config.getOrThrow<string>('RAZORPAY_KEY_ID'),
              config.getOrThrow<string>('RAZORPAY_KEY_SECRET'),
              config.getOrThrow<string>('RAZORPAY_WEBHOOK_SECRET'),
            )
          : new DevelopmentPaymentProvider(config.getOrThrow<string>('OTP_HASH_SECRET')),
    },
    {
      provide: PayoutProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PayoutProvider => {
        if (!['development', 'test'].includes(config.getOrThrow<string>('NODE_ENV')))
          return {
            process: (): Promise<never> =>
              Promise.reject(new Error('Real payout provider is not configured')),
          };
        return new DevelopmentPayoutProvider();
      },
    },
  ],
})
export class FinanceModule {}
