import { createHmac, timingSafeEqual } from 'node:crypto';

export function sign(value: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function validSignature(value: string | Buffer, signature: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(sign(value, secret), 'hex'), Buffer.from(signature, 'hex'));
}
