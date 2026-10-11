/* eslint-disable @typescript-eslint/unbound-method */
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import {
  PartnerGymOsAttendanceController,
  PartnerGymOsMemberAttendanceController,
} from './gym-os-attendance.controller';
import { PartnerGymOsAnalyticsReminderController } from './gym-os-analytics-reminder.controller';
import { PartnerGymOsMemberFinanceController } from './gym-os-member-finance.controller';
import { PartnerGymOsMemberController } from './gym-os-member.controller';
import { PartnerGymOsMembershipController } from './gym-os-membership.controller';

const partnerControllers = [
  PartnerGymOsMemberController,
  PartnerGymOsMembershipController,
  PartnerGymOsAttendanceController,
  PartnerGymOsMemberAttendanceController,
  PartnerGymOsMemberFinanceController,
  PartnerGymOsAnalyticsReminderController,
];

describe('Partner GymOS role contract', () => {
  it.each(partnerControllers)(
    '%p admits platform admins to gym-scoped authorization',
    (controller) => {
      const roles = Reflect.getMetadata(ROLES_KEY, controller) as RoleName[];
      expect(roles).toEqual(expect.arrayContaining([RoleName.ADMIN, RoleName.SUPER_ADMIN]));
    },
  );

  it('keeps write endpoints limited while admitting admins', () => {
    const writeMethods = [
      'createPlan',
      'updatePlan',
      'activate',
      'deactivate',
      'archive',
      'assign',
      'freeze',
      'resume',
      'renew',
      'cancel',
    ] as const;
    for (const method of writeMethods) {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        PartnerGymOsMembershipController.prototype[method],
      ) as RoleName[];
      expect(roles).toEqual(
        expect.arrayContaining([
          RoleName.GYM_OWNER,
          RoleName.GYM_MANAGER,
          RoleName.ADMIN,
          RoleName.SUPER_ADMIN,
        ]),
      );
      expect(roles).not.toContain(RoleName.GYM_STAFF);
    }
  });
});
