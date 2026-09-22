import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { CommissionService } from './finance-policy';
import { DevelopmentPaymentProvider } from './providers/development-payment.provider';
import { sign } from './providers/signatures';

describe('PaymentsService trust boundaries', () => {
  const provider = new DevelopmentPaymentProvider('test-secret');
  const commission = new CommissionService(new ConfigService());
  it('scopes verification to the authenticated booking customer', async () => {
    const prisma = { payment: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new PaymentsService(prisma as never, provider, commission);
    await expect(
      service.verify('customer-a', 'payment-b', 'order', 'receipt', 'signature'),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' },
    });
    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { id: 'payment-b', booking: { userId: 'customer-a' } },
    });
  });
  it('rejects an order belonging to a different payment before contacting provider', async () => {
    const prisma = {
      payment: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ provider: 'development', providerOrderId: 'correct' }),
      },
    };
    const service = new PaymentsService(prisma as never, provider, commission);
    await expect(
      service.verify('customer', 'payment', 'wrong', 'receipt', 'signature'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PAYMENT_VERIFICATION_FAILED' }),
    });
  });
  it('rejects webhook signatures before recording any event', async () => {
    const service = new PaymentsService({} as never, provider, commission);
    await expect(
      service.webhook('development', 'event', Buffer.from('{}'), 'invalid'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_PAYMENT_SIGNATURE' }),
    });
  });
  it.each(['{', 'null', '[]'])('rejects signed malformed webhook payload %s', async (body) => {
    const service = new PaymentsService({} as never, provider, commission);
    await expect(
      service.webhook('development', 'event', Buffer.from(body), sign(body, 'test-secret')),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VALIDATION_FAILED' }) });
  });
  it('acknowledges a processed duplicate without reapplying capture', async () => {
    const body = '{}';
    const { createHash } = await import('node:crypto');
    const prisma = {
      paymentWebhookEvent: {
        upsert: jest.fn().mockResolvedValue({
          payloadHash: createHash('sha256').update(body).digest('hex'),
          processedAt: new Date(),
        }),
      },
    };
    const service = new PaymentsService(prisma as never, provider, commission);
    await expect(
      service.webhook('development', 'event', Buffer.from(body), sign(body, 'test-secret')),
    ).resolves.toEqual({ accepted: true, duplicate: true });
  });
});
