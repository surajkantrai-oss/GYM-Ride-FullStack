export interface ProviderOrder {
  id: string;
  amount: number;
  currency: string;
}

export interface VerifiedPayment {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'authorized' | 'captured' | 'failed';
}

export interface ProviderRefund {
  reference?: string;
  currency?: string;
  id: string;
  paymentId: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
}

export type ProviderEvent =
  | { kind: 'payment'; type: string; id: string; orderId: string }
  | { kind: 'refund'; type: string; id: string }
  | { kind: 'ignored'; type: string };

export abstract class PaymentProvider {
  abstract readonly name: string;
  abstract decodeWebhook(payload: unknown): ProviderEvent;
  /** Publishable checkout configuration only; never return provider secrets. */
  checkoutConfiguration(): { keyId?: string } {
    return {};
  }
  abstract createPaymentOrder(
    reference: string,
    amount: number,
    currency: string,
  ): Promise<ProviderOrder>;
  abstract verifyPayment(
    orderId: string,
    paymentId: string,
    signature: string,
  ): Promise<VerifiedPayment>;
  abstract verifyWebhook(raw: Buffer, signature: string): boolean;
  abstract getPaymentStatus(paymentId: string): Promise<VerifiedPayment>;
  abstract refundPayment(
    paymentId: string,
    amount: number,
    reference: string,
  ): Promise<ProviderRefund>;
  abstract getRefundStatus(refundId: string): Promise<ProviderRefund>;
}
