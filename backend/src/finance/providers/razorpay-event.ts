import { ProviderEvent } from './payment-provider';

/** Decode only after raw signature verification; values are hints for authenticated status lookup. */
export function decodeRazorpayEvent(payload: unknown): ProviderEvent {
  const value = payload as {
    event?: unknown;
    payload?: {
      payment?: { entity?: { id?: unknown; order_id?: unknown } };
      refund?: { entity?: { id?: unknown } };
    };
  };
  const type = typeof value.event === 'string' ? value.event : 'unknown';
  if (type.length > 80) throw new Error('Event type too long');
  if (['refund.created', 'refund.pending', 'refund.processed', 'refund.failed'].includes(type)) {
    const id = value.payload?.refund?.entity?.id;
    if (typeof id !== 'string' || !id || id.length > 2000)
      throw new Error('Refund reference required');
    return { kind: 'refund', type, id };
  }
  if (['payment.authorized', 'payment.captured', 'payment.failed'].includes(type)) {
    const entity = value.payload?.payment?.entity;
    if (
      typeof entity?.id !== 'string' ||
      !entity.id ||
      typeof entity.order_id !== 'string' ||
      !entity.order_id ||
      entity.id.length > 2000 ||
      entity.order_id.length > 1000
    )
      throw new Error('Payment references required');
    return { kind: 'payment', type, id: entity.id, orderId: entity.order_id };
  }
  return { kind: 'ignored', type };
}
