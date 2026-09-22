import {
  PaymentProvider,
  ProviderOrder,
  ProviderRefund,
  VerifiedPayment,
} from './payment-provider';
import { sign, validSignature } from './signatures';
import { decodeRazorpayEvent } from './razorpay-event';

/** Signed, stateless sandbox receipts survive API restarts. Never enabled outside dev/test. */
export class DevelopmentPaymentProvider extends PaymentProvider {
  readonly name = 'development';
  decodeWebhook = decodeRazorpayEvent;
  constructor(private readonly secret: string) {
    super();
  }
  createPaymentOrder(reference: string, amount: number, currency: string): Promise<ProviderOrder> {
    return Promise.resolve({ id: `dev_order_${reference}`, amount, currency });
  }
  simulate(
    orderId: string,
    amount: number,
    currency: string,
  ): { paymentId: string; signature: string } {
    const data = Buffer.from(
      JSON.stringify({ orderId, amount, currency, status: 'captured' }),
    ).toString('base64url');
    const paymentId = `${data}.${sign(data, this.secret)}`;
    return { paymentId, signature: sign(`${orderId}|${paymentId}`, this.secret) };
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
    return validSignature(raw, signature, this.secret);
  }
  getPaymentStatus(paymentId: string): Promise<VerifiedPayment> {
    const [data, signature] = paymentId.split('.');
    if (!data || !signature || !validSignature(data, signature, this.secret))
      throw new Error('Invalid sandbox receipt');
    const receipt = JSON.parse(Buffer.from(data, 'base64url').toString()) as Omit<
      VerifiedPayment,
      'id'
    >;
    return Promise.resolve({ ...receipt, id: paymentId });
  }
  refundPayment(paymentId: string, amount: number, reference: string): Promise<ProviderRefund> {
    const data = Buffer.from(JSON.stringify({ paymentId, amount, reference })).toString(
      'base64url',
    );
    return Promise.resolve({
      id: `${data}.${sign(data, this.secret)}`,
      paymentId,
      amount,
      reference,
      status: 'processed',
    });
  }
  getRefundStatus(refundId: string): Promise<ProviderRefund> {
    const [data, signature] = refundId.split('.');
    if (!data || !signature || !validSignature(data, signature, this.secret))
      throw new Error('Invalid sandbox refund');
    const value = JSON.parse(Buffer.from(data, 'base64url').toString()) as {
      paymentId: string;
      amount: number;
    };
    return Promise.resolve({ ...value, id: refundId, status: 'processed' });
  }
}
