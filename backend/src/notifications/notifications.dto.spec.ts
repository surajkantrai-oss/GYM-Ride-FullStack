import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotificationListDto } from './notifications.dto';

describe('NotificationListDto', () => {
  it('does not treat unread=false as true', async () => {
    const query = plainToInstance(NotificationListDto, { page: '1', limit: '20', unread: 'false' });
    expect(query.unread).toBe(false);
    expect(await validate(query)).toHaveLength(0);
  });
  it('rejects arbitrary unread filter values', async () => {
    const query = plainToInstance(NotificationListDto, { page: '1', limit: '20', unread: 'sometimes' });
    expect(await validate(query)).not.toHaveLength(0);
  });
});
