import { DevelopmentPaymentProvider } from './development-payment.provider';
import { sign, validSignature } from './signatures';

describe('development payment provider', () => {
  const secret = 'test-only-payment-secret';
  const provider = new DevelopmentPaymentProvider(secret);
  it('creates stable orders for retries', async () => {
    expect(await provider.createPaymentOrder('booking', 10000, 'INR')).toEqual(
      await provider.createPaymentOrder('booking', 10000, 'INR'),
    );
  });
  it('verifies signed receipts independently after restart', async () => {
    const receipt = provider.simulate('order', 10000, 'INR');
    expect(
      await new DevelopmentPaymentProvider(secret).verifyPayment(
        'order',
        receipt.paymentId,
        receipt.signature,
      ),
    ).toMatchObject({ orderId: 'order', amount: 10000, currency: 'INR', status: 'captured' });
  });
  it('rejects a receipt associated with another order', async () => {
    const receipt = provider.simulate('order', 10000, 'INR');
    await expect(
      provider.verifyPayment('other', receipt.paymentId, receipt.signature),
    ).rejects.toThrow();
  });
  it('rejects forged checkout signatures', async () => {
    const receipt = provider.simulate('order', 10000, 'INR');
    await expect(
      provider.verifyPayment('order', receipt.paymentId, '0'.repeat(64)),
    ).rejects.toThrow();
  });
  it('rejects unsigned sandbox receipts', () => {
    expect(() => provider.getPaymentStatus('fake.receipt')).toThrow();
  });
  it('verifies exact raw webhook bytes', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    expect(provider.verifyWebhook(body, sign(body, secret))).toBe(true);
    expect(
      provider.verifyWebhook(Buffer.concat([body, Buffer.from(' ')]), sign(body, secret)),
    ).toBe(false);
  });
  it.each(['', 'bad', 'z'.repeat(64), '0'.repeat(63)])(
    'rejects malformed signature %s',
    (signature) => {
      expect(validSignature('payload', signature, secret)).toBe(false);
    },
  );
  it('uses stable refund references and independently recoverable status', async () => {
    const refund = await provider.refundPayment('payment', 500, 'refund-reference');
    expect(await provider.refundPayment('payment', 500, 'refund-reference')).toEqual(refund);
    expect(await new DevelopmentPaymentProvider(secret).getRefundStatus(refund.id)).toMatchObject({
      paymentId: 'payment',
      amount: 500,
      status: 'processed',
    });
  });
});
