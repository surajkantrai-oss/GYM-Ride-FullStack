import { GymOsReminderChannel } from '@prisma/client';
import { DevelopmentGymOsMessagingProvider } from './gym-os-messaging.provider';

describe('DevelopmentGymOsMessagingProvider', () => {
  it('returns a deterministic non-external development reference', async () => {
    const provider = new DevelopmentGymOsMessagingProvider();
    const input = { deliveryId: 'delivery-1', channel: GymOsReminderChannel.EMAIL, contact: 'member@example.invalid', template: 'Reminder' };
    await expect(provider.send(input)).resolves.toEqual(await provider.send(input));
    expect((await provider.send(input)).messageId).toMatch(/^dev_[a-f0-9]{24}$/);
  });
});
