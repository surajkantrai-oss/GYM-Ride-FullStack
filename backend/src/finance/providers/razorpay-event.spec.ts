import { decodeRazorpayEvent } from './razorpay-event';
import { RazorpayPaymentProvider } from './razorpay-payment.provider';
import { sign } from './signatures';

describe('provider-independent refund webhook mapping', () => {
  it.each(['refund.created', 'refund.pending', 'refund.processed', 'refund.failed'])(
    'maps %s to authoritative refund lookup',
    (event) => {
      expect(
        decodeRazorpayEvent({ event, payload: { refund: { entity: { id: 'refund-id' } } } }),
      ).toEqual({ kind: 'refund', type: event, id: 'refund-id' });
    },
  );
  it('ignores unknown event types', () => {
    expect(decodeRazorpayEvent({ event: 'unknown.event' }).kind).toBe('ignored');
  });
  it.each([{}, { id: 5 }, { id: '' }])('rejects malformed refund reference %j', (entity) => {
    expect(() =>
      decodeRazorpayEvent({ event: 'refund.processed', payload: { refund: { entity } } }),
    ).toThrow();
  });
  it('verifies refund webhook raw signature with dedicated secret', () => {
    const provider = new RazorpayPaymentProvider('test-key', 'checkout-secret', 'webhook-secret');
    const body = Buffer.from('{"event":"refund.processed"}');
    expect(provider.verifyWebhook(body, sign(body, 'webhook-secret'))).toBe(true);
    expect(provider.verifyWebhook(body, sign(body, 'checkout-secret'))).toBe(false);
  });
});
