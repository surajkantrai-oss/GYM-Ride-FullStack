/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AuditAction,
  GymOsFeature,
  GymOsReminderChannel,
  GymOsReminderDeliveryStatus,
  GymOsReminderType,
  Prisma,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { GymOsEntitlementService } from './gym-os-entitlement.service';
import {
  GymOsCommunicationPreferenceDto,
  GymOsReminderListDto,
  ManualGymOsReminderDto,
  UpdateGymOsReminderRuleDto,
} from './gym-os-reminder.dto';
import { GymOsMessagingProvider } from './providers/gym-os-messaging.provider';
import { GymOsReminderTimeService } from './gym-os-reminder-time.service';

const DEFAULTS: Array<[GymOsReminderType, number]> = [
  [GymOsReminderType.MEMBERSHIP_EXPIRING, 7],
  [GymOsReminderType.MEMBERSHIP_EXPIRING, 3],
  [GymOsReminderType.MEMBERSHIP_EXPIRING, 1],
  [GymOsReminderType.MEMBERSHIP_EXPIRED, 0],
  [GymOsReminderType.PAYMENT_DUE, 3],
  [GymOsReminderType.PAYMENT_DUE, 0],
  [GymOsReminderType.PAYMENT_OVERDUE, 1],
  [GymOsReminderType.PAYMENT_OVERDUE, 3],
  [GymOsReminderType.PAYMENT_OVERDUE, 7],
  [GymOsReminderType.INACTIVITY, 14],
];
@Injectable()
export class GymOsReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
    private readonly entitlements: GymOsEntitlementService,
    @Inject('GYMOS_MESSAGING_PROVIDER') private readonly provider: GymOsMessagingProvider,
    private readonly time: GymOsReminderTimeService,
  ) {}
  private async feature(gymId: string) {
    const e = await this.entitlements.getEffectiveEntitlements(gymId);
    if (!e.subscribed || !e.features.includes(GymOsFeature.REMINDERS))
      throw new DomainException(
        ApiErrorCode.GYMOS_REMINDERS_FEATURE_REQUIRED,
        'GymOS Reminders entitlement required',
        HttpStatus.PAYMENT_REQUIRED,
      );
  }
  private async ensureRules(gymId: string) {
    await this.prisma.gymOsReminderRule.createMany({
      data: DEFAULTS.map(([type, offsetDays]) => ({
        gymId,
        type,
        offsetDays,
        channel: GymOsReminderChannel.WHATSAPP,
        enabled: false,
      })),
      skipDuplicates: true,
    });
  }
  async rules(user: AuthUser, gymId: string) {
    await this.access.assertGymOsMemberRead(user, gymId);
    await this.feature(gymId);
    await this.ensureRules(gymId);
    return this.prisma.gymOsReminderRule.findMany({
      where: { gymId },
      orderBy: [{ type: 'asc' }, { offsetDays: 'desc' }],
    });
  }
  async updateRule(user: AuthUser, gymId: string, id: string, dto: UpdateGymOsReminderRuleDto) {
    await this.access.assertGymOsMemberWrite(user, gymId);
    await this.feature(gymId);
    const rule = await this.prisma.gymOsReminderRule.findFirst({ where: { id, gymId } });
    if (!rule)
      throw new DomainException(
        ApiErrorCode.GYMOS_REMINDER_RULE_NOT_FOUND,
        'Reminder rule not found',
        HttpStatus.NOT_FOUND,
      );
    const value = await this.prisma.gymOsReminderRule.update({ where: { id }, data: dto });
    await this.audit(user.id, AuditAction.GYMOS_REMINDER_RULE_CHANGED, 'GymOsReminderRule', id, {
      gymId,
      ...dto,
    });
    return value;
  }
  async preference(user: AuthUser, gymId: string, memberId: string) {
    await this.access.assertGymOsMemberRead(user, gymId);
    await this.member(gymId, memberId);
    return (
      this.prisma.gymOsMemberCommunicationPreference.findUnique({ where: { memberId } }) ?? {
        gymId,
        memberId,
        allowTransactional: true,
        allowMarketing: false,
        allowWhatsApp: true,
        allowSms: false,
        allowEmail: false,
      }
    );
  }
  async updatePreference(
    user: AuthUser,
    gymId: string,
    memberId: string,
    dto: GymOsCommunicationPreferenceDto,
  ) {
    await this.access.assertGymOsMemberWrite(user, gymId);
    await this.member(gymId, memberId);
    const value = await this.prisma.gymOsMemberCommunicationPreference.upsert({
      where: { memberId },
      create: { gymId, memberId, updatedByUserId: user.id, ...dto },
      update: { updatedByUserId: user.id, ...dto },
    });
    await this.audit(
      user.id,
      AuditAction.GYMOS_COMMUNICATION_PREFERENCE_CHANGED,
      'GymOsMemberCommunicationPreference',
      value.id,
      { gymId, memberId },
    );
    return value;
  }
  async deliveries(user: AuthUser, gymId: string, q: GymOsReminderListDto) {
    await this.access.assertGymOsMemberRead(user, gymId);
    await this.feature(gymId);
    const where = {
      gymId,
      ...(q.status && { status: q.status }),
      ...(q.type && { type: q.type }),
      ...(q.memberId && { memberId: q.memberId }),
    };
    const [items, total] = await Promise.all([
      this.prisma.gymOsReminderDelivery.findMany({
        where,
        include: { member: { select: { memberCode: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.gymOsReminderDelivery.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async manual(user: AuthUser, gymId: string, dto: ManualGymOsReminderDto) {
    await this.access.assertGymOsMemberWrite(user, gymId);
    await this.feature(gymId);
    await this.member(gymId, dto.memberId);
    const start = DateTime.utc().startOf('day').toJSDate(),
      day = DateTime.utc().toISODate(),
      dedupeKey = `manual:${gymId}:${dto.memberId}:${dto.type}:${dto.channel}:${dto.subjectId}:${day}`;
    const [memberCount, gymCount, userCount] = await Promise.all([
      this.prisma.gymOsReminderDelivery.count({
        where: { gymId, memberId: dto.memberId, createdAt: { gte: start } },
      }),
      this.prisma.gymOsReminderDelivery.count({ where: { gymId, createdAt: { gte: start } } }),
      this.prisma.auditLog.count({
        where: {
          actorUserId: user.id,
          action: AuditAction.GYMOS_REMINDER_MANUAL_REQUESTED,
          createdAt: { gte: start },
        },
      }),
    ]);
    if (memberCount >= 2 || gymCount >= 200 || userCount >= 20)
      throw new DomainException(
        ApiErrorCode.GYMOS_REMINDER_RATE_LIMITED,
        'Daily reminder cap reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const scheduledFor = await this.time.resolveAllowedSendTime(gymId, new Date());
    try {
      const value = await this.prisma.gymOsReminderDelivery.create({
        data: {
          gymId,
          memberId: dto.memberId,
          type: dto.type,
          channel: dto.channel,
          subjectType: this.subjectType(dto.type),
          subjectId: dto.subjectId,
          scheduledFor,
          dedupeKey,
        },
      });
      await this.audit(
        user.id,
        AuditAction.GYMOS_REMINDER_MANUAL_REQUESTED,
        'GymOsReminderDelivery',
        value.id,
        { gymId, memberId: dto.memberId, type: dto.type },
      );
      return scheduledFor.getTime() > Date.now() + 1000 ? value : this.dispatch(value.id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new DomainException(
          ApiErrorCode.GYMOS_REMINDER_ALREADY_SENT,
          'Equivalent reminder already scheduled',
          HttpStatus.CONFLICT,
        );
      throw e;
    }
  }
  async evaluate(gymId?: string) {
    const gyms = gymId
      ? [gymId]
      : (
          await this.prisma.gymOsReminderRule.findMany({
            where: { enabled: true },
            distinct: ['gymId'],
            select: { gymId: true },
          })
        ).map((x) => x.gymId);
    let created = 0;
    for (const id of gyms) {
      if (!(await this.entitlements.hasFeature(id, GymOsFeature.REMINDERS))) continue;
      const rules = await this.prisma.gymOsReminderRule.findMany({
        where: { gymId: id, enabled: true },
      });
      for (const rule of rules) {
        const targets = await this.targets(rule.gymId, rule.type, rule.offsetDays);
        const scheduledFor = await this.scheduleFor(
          id,
          rule.sendTime,
          rule.quietStart,
          rule.quietEnd,
        );
        for (const t of targets) {
          const date = DateTime.fromJSDate(scheduledFor).toISODate();
          const result = await this.prisma.gymOsReminderDelivery.createMany({
            data: [
              {
                gymId: id,
                memberId: t.memberId,
                ruleId: rule.id,
                type: rule.type,
                channel: rule.channel,
                subjectType: t.subjectType,
                subjectId: t.subjectId,
                scheduledFor,
                dedupeKey: `rule:${rule.id}:${t.subjectId}:${date}`,
              },
            ],
            skipDuplicates: true,
          });
          created += result.count;
        }
        await this.prisma.gymOsReminderRule.update({
          where: { id: rule.id },
          data: { lastRunAt: new Date() },
        });
      }
    }
    return { created };
  }
  async processDue() {
    const due = await this.prisma.gymOsReminderDelivery.findMany({
      where: { status: GymOsReminderDeliveryStatus.SCHEDULED, scheduledFor: { lte: new Date() } },
      select: { id: true },
      take: 100,
      orderBy: { scheduledFor: 'asc' },
    });
    for (const x of due) await this.dispatch(x.id);
    return { processed: due.length };
  }
  async recoverStaleProcessing() {
    const cutoff = new Date(Date.now() - 15 * 60000);
    const recovered = await this.prisma.gymOsReminderDelivery.updateMany({
      where: {
        status: GymOsReminderDeliveryStatus.PROCESSING,
        attemptedAt: { lt: cutoff },
        attemptCount: { lt: 5 },
      },
      data: {
        status: GymOsReminderDeliveryStatus.SCHEDULED,
        scheduledFor: new Date(),
        lastErrorCode: 'STALE_PROCESSING_RECOVERED',
      },
    });
    const failed = await this.prisma.gymOsReminderDelivery.updateMany({
      where: {
        status: GymOsReminderDeliveryStatus.PROCESSING,
        attemptedAt: { lt: cutoff },
        attemptCount: { gte: 5 },
      },
      data: { status: GymOsReminderDeliveryStatus.FAILED, lastErrorCode: 'MAX_ATTEMPTS' },
    });
    return { recovered: recovered.count, failed: failed.count };
  }
  async dispatch(id: string) {
    const d = await this.prisma.gymOsReminderDelivery.findUnique({
      where: { id },
      include: { member: true },
    });
    if (!d)
      throw new DomainException(
        ApiErrorCode.GYMOS_REMINDER_DELIVERY_NOT_FOUND,
        'Reminder delivery not found',
        HttpStatus.NOT_FOUND,
      );
    if (
      d.status === GymOsReminderDeliveryStatus.SENT ||
      d.status === GymOsReminderDeliveryStatus.SKIPPED ||
      (d.status === GymOsReminderDeliveryStatus.FAILED && d.attemptCount >= 5)
    )
      return d;
    const entitled = await this.entitlements.hasFeature(d.gymId, GymOsFeature.REMINDERS);
    const pref = await this.prisma.gymOsMemberCommunicationPreference.findUnique({
      where: { memberId: d.memberId },
    });
    const allowed =
      !pref ||
      (pref.allowTransactional &&
        (d.channel === GymOsReminderChannel.WHATSAPP
          ? pref.allowWhatsApp
          : d.channel === GymOsReminderChannel.SMS
            ? pref.allowSms
            : pref.allowEmail));
    const contact = d.channel === GymOsReminderChannel.EMAIL ? d.member.email : d.member.phone;
    if (!entitled || !allowed || !contact || !(await this.stillValid(d))) {
      return this.prisma.gymOsReminderDelivery.update({
        where: { id },
        data: {
          status: GymOsReminderDeliveryStatus.SKIPPED,
          lastErrorCode: !entitled
            ? 'ENTITLEMENT_INACTIVE'
            : !allowed
              ? 'OPTED_OUT'
              : !contact
                ? 'CONTACT_MISSING'
                : 'STALE',
        },
      });
    }
    const claimed = await this.prisma.gymOsReminderDelivery.updateMany({
      where: {
        id,
        attemptCount: { lt: 5 },
        status: { in: [GymOsReminderDeliveryStatus.SCHEDULED, GymOsReminderDeliveryStatus.FAILED] },
      },
      data: {
        status: GymOsReminderDeliveryStatus.PROCESSING,
        attemptedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    if (!claimed.count) return this.prisma.gymOsReminderDelivery.findUnique({ where: { id } });
    try {
      const sent = await this.provider.send({
        deliveryId: id,
        channel: d.channel,
        contact,
        template: this.template(d.type, d.member.firstName),
      });
      return this.prisma.gymOsReminderDelivery.update({
        where: { id },
        data: {
          status: GymOsReminderDeliveryStatus.SENT,
          sentAt: new Date(),
          provider: this.provider.name,
          providerMessageId: sent.messageId,
          lastErrorCode: null,
        },
      });
    } catch {
      return this.prisma.gymOsReminderDelivery.update({
        where: { id },
        data: {
          status:
            d.attemptCount + 1 >= 5
              ? GymOsReminderDeliveryStatus.FAILED
              : GymOsReminderDeliveryStatus.SCHEDULED,
          scheduledFor: new Date(Date.now() + Math.min(60, d.attemptCount + 1) * 60000),
          lastErrorCode: 'PROVIDER_ERROR',
        },
      });
    }
  }
  async adminDeliveries(q: GymOsReminderListDto, gymId?: string) {
    const where = {
      ...(gymId && { gymId }),
      ...(q.status && { status: q.status }),
      ...(q.type && { type: q.type }),
    };
    const [items, total] = await Promise.all([
      this.prisma.gymOsReminderDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.gymOsReminderDelivery.count({ where }),
    ]);
    return { items, total };
  }
  private async member(gymId: string, id: string) {
    const m = await this.prisma.gymMember.findFirst({ where: { id, gymId } });
    if (!m)
      throw new DomainException(
        ApiErrorCode.GYMOS_MEMBER_NOT_FOUND,
        'Member not found',
        HttpStatus.NOT_FOUND,
      );
    return m;
  }
  private subjectType(t: GymOsReminderType) {
    return t.startsWith('PAYMENT_') ? 'CHARGE' : t === 'INACTIVITY' ? 'MEMBER' : 'MEMBERSHIP';
  }
  private template(t: GymOsReminderType, name: string) {
    return `${name}, ${t.toLowerCase().replaceAll('_', ' ')}. Please contact your gym for details.`;
  }
  private async stillValid(d: { type: GymOsReminderType; subjectId: string; memberId: string }) {
    if (d.type.startsWith('PAYMENT_')) {
      const c = await this.prisma.gymOsMemberCharge.findUnique({
        where: { id: d.subjectId },
        include: { allocations: { include: { payment: true } } },
      });
      return (
        !!c &&
        c.memberId === d.memberId &&
        c.status !== 'VOID' &&
        c.amountMinor >
          c.allocations
            .filter((a) => a.payment.status === 'RECORDED')
            .reduce((n, a) => n + a.amountMinor, 0)
      );
    }
    if (d.type === GymOsReminderType.INACTIVITY) {
      return !(await this.prisma.gymOsAttendance.findFirst({
        where: { memberId: d.memberId, checkInAt: { gte: new Date(Date.now() - 14 * 86400000) } },
      }));
    }
    const m = await this.prisma.gymOsMembership.findUnique({ where: { id: d.subjectId } });
    return (
      !!m &&
      m.memberId === d.memberId &&
      (d.type === GymOsReminderType.MEMBERSHIP_EXPIRING
        ? m.status === 'ACTIVE'
        : m.status === 'EXPIRED')
    );
  }
  private async targets(gymId: string, type: GymOsReminderType, offset: number) {
    const now = DateTime.utc().startOf('day');
    if (type === GymOsReminderType.MEMBERSHIP_EXPIRING) {
      const day = now.plus({ days: offset });
      return (
        await this.prisma.gymOsMembership.findMany({
          where: {
            gymId,
            status: 'ACTIVE',
            endDate: { gte: day.toJSDate(), lt: day.plus({ days: 1 }).toJSDate() },
          },
          select: { id: true, memberId: true },
        })
      ).map((x) => ({ memberId: x.memberId, subjectId: x.id, subjectType: 'MEMBERSHIP' }));
    }
    if (type === GymOsReminderType.MEMBERSHIP_EXPIRED) {
      return (
        await this.prisma.gymOsMembership.findMany({
          where: {
            gymId,
            status: 'EXPIRED',
            endDate: { gte: now.toJSDate(), lt: now.plus({ days: 1 }).toJSDate() },
          },
          select: { id: true, memberId: true },
        })
      ).map((x) => ({ memberId: x.memberId, subjectId: x.id, subjectType: 'MEMBERSHIP' }));
    }
    if (type === GymOsReminderType.PAYMENT_DUE) {
      const day = now.plus({ days: offset });
      return (
        await this.prisma.gymOsMemberCharge.findMany({
          where: {
            gymId,
            status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
            dueDate: { gte: day.toJSDate(), lt: day.plus({ days: 1 }).toJSDate() },
          },
          select: { id: true, memberId: true },
        })
      ).map((x) => ({ memberId: x.memberId, subjectId: x.id, subjectType: 'CHARGE' }));
    }
    if (type === GymOsReminderType.PAYMENT_OVERDUE) {
      const day = now.minus({ days: offset });
      return (
        await this.prisma.gymOsMemberCharge.findMany({
          where: {
            gymId,
            status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
            dueDate: { lte: day.toJSDate() },
          },
          select: { id: true, memberId: true },
        })
      ).map((x) => ({ memberId: x.memberId, subjectId: x.id, subjectType: 'CHARGE' }));
    }
    if (type === GymOsReminderType.INACTIVITY) {
      return (
        await this.prisma.gymMember.findMany({
          where: {
            gymId,
            status: 'ACTIVE',
            attendances: { none: { checkInAt: { gte: now.minus({ days: offset }).toJSDate() } } },
            memberships: { some: { status: 'ACTIVE' } },
          },
          select: { id: true },
        })
      ).map((x) => ({ memberId: x.id, subjectId: x.id, subjectType: 'MEMBER' }));
    }
    return [];
  }
  private scheduleFor(gymId: string, sendTime: string, quietStart: string, quietEnd: string) {
    return this.time.atLocalSendTime(gymId, sendTime, quietStart, quietEnd);
  }
  private audit(
    actorUserId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: { actorUserId, action, entityType, entityId, metadata },
    });
  }
}
