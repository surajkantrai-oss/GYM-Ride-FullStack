import {
  PaymentProvider,
  ProviderOrder,
  ProviderRefund,
  VerifiedPayment,
} from './payment-provider';
import { validSignature } from './signatures';
import { decodeRazorpayEvent } from './razorpay-event';

interface RazorPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
}
interface RazorRefund {
  receipt?: string | null;
  currency: string;
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

export class RazorpayPaymentProvider extends PaymentProvider {
  readonly name = 'razorpay';
  decodeWebhook = decodeRazorpayEvent;
  override checkoutConfiguration(): { keyId: string } {
    return { keyId: this.keyId };
  }
  constructor(
    private readonly keyId: string,
    private readonly secret: string,
    private readonly webhookSecret: string,
  ) {
    super();
  }
  private async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.secret}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        `Provider request failed (${response.status}); reconcile before retrying a write`,
      );
    return response.json() as Promise<T>;
  }
  createPaymentOrder(reference: string, amount: number, currency: string): Promise<ProviderOrder> {
    return this.request('/orders', { amount, currency, receipt: reference });
  }
  async verifyPayment(
    orderId: string,
    paymentId: string,
    signature: string,
  ): Promise<VerifiedPayment> {
    if (!validSignature(`${orderId}|${paymentId}`, signature, this.secret))
      throw new Error('Invalid payment signature');
    return this.getPaymentStatus(paymentId);
  }
  verifyWebhook(raw: Buffer, signature: string): boolean {
    return validSignature(raw, signature, this.webhookSecret);
  }
  async getPaymentStatus(paymentId: string): Promise<VerifiedPayment> {
    const result = await this.request<RazorPayment>(`/payments/${encodeURIComponent(paymentId)}`);
    if (!['authorized', 'captured', 'failed'].includes(result.status))
      throw new Error('Payment is not finalizable');
    return {
      id: result.id,
      orderId: result.order_id,
      amount: result.amount,
      currency: result.currency,
      status: result.status as VerifiedPayment['status'],
    };
  }
  async refundPayment(
    paymentId: string,
    amount: number,
    reference: string,
  ): Promise<ProviderRefund> {
    const result = await this.request<RazorRefund>(
      `/payments/${encodeURIComponent(paymentId)}/refund`,
      { amount, receipt: reference },
    );
    return this.refund(result);
  }
  async getRefundStatus(refundId: string): Promise<ProviderRefund> {
    return this.refund(await this.request<RazorRefund>(`/refunds/${encodeURIComponent(refundId)}`));
  }
  private refund(value: RazorRefund): ProviderRefund {
    return {
      ...(value.receipt ? { reference: value.receipt } : {}),
      currency: value.currency,
      id: value.id,
      paymentId: value.payment_id,
      amount: value.amount,
      status:
        value.status === 'processed'
          ? 'processed'
          : value.status === 'failed'
            ? 'failed'
            : 'pending',
    };
  }
}
