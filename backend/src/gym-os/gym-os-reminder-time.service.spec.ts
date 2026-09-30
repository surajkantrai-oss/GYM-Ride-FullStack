import { DateTime } from 'luxon';import { GymOsReminderTimeService } from './gym-os-reminder-time.service';
describe('GymOsReminderTimeService',()=>{const prisma={gymBranch:{findFirst:jest.fn().mockResolvedValue({timezone:'Asia/Kolkata'})}} as never,service=new GymOsReminderTimeService(prisma);
 it('moves a manual send in overnight quiet hours to next permitted local time',async()=>{const desired=DateTime.fromISO('2026-09-27T22:30:00',{zone:'Asia/Kolkata'}).toUTC().toJSDate(),value=await service.resolveAllowedSendTime('gym',desired);expect(DateTime.fromJSDate(value).setZone('Asia/Kolkata').toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-28 08:00');});
 it('keeps an allowed time unchanged',async()=>{const desired=DateTime.fromISO('2026-09-27T10:30:00',{zone:'Asia/Kolkata'}).toUTC().toJSDate();expect(await service.resolveAllowedSendTime('gym',desired)).toEqual(desired);});
});
