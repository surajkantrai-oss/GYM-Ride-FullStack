import { PushProvider, PushResult } from './push-provider';

/** Never claims that a bank/device/provider received a development push. */
export class DevelopmentPushProvider extends PushProvider {
  readonly name = 'development';
  send(): Promise<PushResult> {
    return Promise.resolve({ status: 'SKIPPED', code: 'DEVELOPMENT_PROVIDER' });
  }
}
