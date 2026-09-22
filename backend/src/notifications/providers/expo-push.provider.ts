import { PushMessage, PushProvider, PushResult } from './push-provider';

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

export class ExpoPushProvider extends PushProvider {
  readonly name = 'expo';
  async send(message: PushMessage): Promise<PushResult> {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ to: message.token, title: message.title, body: message.body, data: message.data, sound: 'default' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        return { status: 'FAILED', code: `EXPO_HTTP_${response.status}`, permanent: response.status >= 400 && response.status < 500 && response.status !== 429, invalidateToken: false };
      const payload = (await response.json()) as { data?: ExpoTicket; errors?: unknown[] };
      const ticket = payload.data;
      if (ticket?.status === 'ok' && ticket.id)
        return { status: 'ACCEPTED', providerMessageId: ticket.id };
      const code = ticket?.details?.error || 'EXPO_TICKET_ERROR';
      return { status: 'FAILED', code, permanent: ['DeviceNotRegistered', 'MessageTooBig', 'InvalidCredentials'].includes(code), invalidateToken: code === 'DeviceNotRegistered' };
    } catch {
      return { status: 'FAILED', code: 'EXPO_NETWORK_ERROR', permanent: false, invalidateToken: false };
    }
  }
}
