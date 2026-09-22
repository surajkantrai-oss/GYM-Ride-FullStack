export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export type PushResult =
  | { status: 'ACCEPTED'; providerMessageId: string }
  | { status: 'SKIPPED'; code: string }
  | { status: 'FAILED'; code: string; permanent: boolean; invalidateToken: boolean };

export abstract class PushProvider {
  abstract readonly name: string;
  abstract send(message: PushMessage): Promise<PushResult>;
}
