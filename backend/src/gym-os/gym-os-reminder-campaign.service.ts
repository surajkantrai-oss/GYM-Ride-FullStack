/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  GymOsFeature,
  GymOsReminderCampaignSegment,
  GymOsReminderCampaignStatus,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { GymOsEntitlementService } from './gym-os-entitlement.service';
import { CreateGymOsReminderCampaignDto, GymOsCampaignListDto } from './gym-os-reminder.dto';
import { GymOsReminderTimeService } from './gym-os-reminder-time.service';

@Injectable()
export class GymOsReminderCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
    private readonly entitlements: GymOsEntitlementService,
    private readonly time: GymOsReminderTimeService,
  ) {}
  async preview(user: AuthUser, gymId: string, dto: CreateGymOsReminderCampaignDto) {
    await this.write(user, gymId);
    const targets = await this.targets(gymId, dto.segment);
    return this.counts(targets, dto.channel);
  }
  async create(user: AuthUser, gymId: string, dto: CreateGymOsReminderCampaignDto) {
    await this.write(user, gymId);
    const requested = new Date(dto.scheduledFor);
    if (!Number.isFinite(requested.getTime()) || requested <= new Date())
      throw new DomainException(
        ApiErrorCode.VALIDATION_FAILED,
        'Campaign must be scheduled in the future',
        HttpStatus.BAD_REQUEST,
      );
    const today = DateTime.utc().startOf('day').toJSDate(),
      count = await this.prisma.gymOsReminderCampaign.count({
        where: { gymId, createdAt: { gte: today } },
      });
    if (count >= 10)
      throw new DomainException(
        ApiErrorCode.GYMOS_REMINDER_RATE_LIMITED,
        'Daily campaign scheduling limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const scheduledFor = await this.time.resolveAllowedSendTime(gymId, requested);
    const value = await this.prisma.gymOsReminderCampaign.create({
      data: {
        gymId,
        name: dto.name.trim(),
        type: dto.type,
        channel: dto.channel,
        segment: dto.segment,
        scheduledFor,
        createdByUserId: user.id,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: AuditAction.GYMOS_REMINDER_CAMPAIGN_CREATED,
        entityType: 'GymOsReminderCampaign',
        entityId: value.id,
        metadata: { gymId, segment: dto.segment },
      },
    });
    return value;
  }
  async list(user: AuthUser, gymId: string, q: GymOsCampaignListDto) {
    await this.access.assertGymOsMemberRead(user, gymId);
    await this.feature(gymId);
    const where = { gymId, ...(q.status && { status: q.status }) },
      [items, total] = await Promise.all([
        this.prisma.gymOsReminderCampaign.findMany({
          where,
          include: {
            _count: { select: { deliveries: true } },
            deliveries: { select: { status: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        this.prisma.gymOsReminderCampaign.count({ where }),
      ]);
    return {
      items: items.map(({ deliveries, ...campaign }) => ({
        ...campaign,
        deliverySummary: this.deliverySummary(deliveries),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async cancel(user: AuthUser, gymId: string, id: string) {
    await this.write(user, gymId);
    const c = await this.prisma.gymOsReminderCampaign.findFirst({ where: { id, gymId } });
    if (!c)
      throw new DomainException(ApiErrorCode.NOT_FOUND, 'Campaign not found', HttpStatus.NOT_FOUND);
    if (
      c.status !== GymOsReminderCampaignStatus.DRAFT &&
      c.status !== GymOsReminderCampaignStatus.SCHEDULED
    )
      throw new DomainException(
        ApiErrorCode.VALIDATION_FAILED,
        'Campaign can no longer be cancelled',
        HttpStatus.CONFLICT,
      );
    const value = await this.prisma.gymOsReminderCampaign.update({
      where: { id },
      data: { status: GymOsReminderCampaignStatus.CANCELLED, cancelledAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: AuditAction.GYMOS_REMINDER_CAMPAIGN_CANCELLED,
        entityType: 'GymOsReminderCampaign',
        entityId: id,
        metadata: { gymId },
      },
    });
    return value;
  }
  async processDue() {
    const due = await this.prisma.gymOsReminderCampaign.findMany({
      where: { status: GymOsReminderCampaignStatus.SCHEDULED, scheduledFor: { lte: new Date() } },
      take: 20,
      orderBy: { scheduledFor: 'asc' },
    });
    for (const c of due) await this.execute(c.id);
    await this.reconcileProcessing();
    return { processed: due.length };
  }
  async execute(id: string) {
    const claimed = await this.prisma.gymOsReminderCampaign.updateMany({
      where: { id, status: GymOsReminderCampaignStatus.SCHEDULED },
      data: { status: GymOsReminderCampaignStatus.PROCESSING, startedAt: new Date() },
    });
    if (!claimed.count) return;
    const c = await this.prisma.gymOsReminderCampaign.findUniqueOrThrow({ where: { id } });
    if (!(await this.entitlements.hasFeature(c.gymId, GymOsFeature.REMINDERS))) {
      await this.prisma.gymOsReminderCampaign.update({
        where: { id },
        data: { status: GymOsReminderCampaignStatus.FAILED, completedAt: new Date() },
      });
      return;
    }
    const targets = await this.targets(c.gymId, c.segment),
      date = DateTime.utc().toISODate();
    await this.prisma.gymOsReminderDelivery.createMany({
      data: targets.map((t) => ({
        gymId: c.gymId,
        memberId: t.id,
        campaignId: c.id,
        type: c.type,
        channel: c.channel,
        subjectType: t.subjectType,
        subjectId: t.subjectId,
        scheduledFor: new Date(),
        dedupeKey: `campaign:${c.id}:${t.id}:${c.type}:${c.channel}:${date}`,
      })),
      skipDuplicates: true,
    });
  }
  async reconcileProcessing() {
    const campaigns = await this.prisma.gymOsReminderCampaign.findMany({
      where: { status: GymOsReminderCampaignStatus.PROCESSING },
      select: { id: true, deliveries: { select: { status: true } } },
      take: 100,
    });
    let completed = 0;
    for (const campaign of campaigns) {
      if (
        campaign.deliveries.every((delivery) =>
          ['SENT', 'FAILED', 'SKIPPED', 'CANCELLED'].includes(delivery.status),
        )
      ) {
        await this.prisma.gymOsReminderCampaign.update({
          where: { id: campaign.id },
          data: { status: GymOsReminderCampaignStatus.COMPLETED, completedAt: new Date() },
        });
        completed++;
      }
    }
    return { completed };
  }
  async admin(q: GymOsCampaignListDto, gymId?: string) {
    const where = { ...(gymId && { gymId }), ...(q.status && { status: q.status }) };
    const campaigns = await this.prisma.gymOsReminderCampaign.findMany({
      where,
      include: {
        _count: { select: { deliveries: true } },
        deliveries: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    return campaigns.map(({ deliveries, ...campaign }) => ({
      ...campaign,
      deliverySummary: this.deliverySummary(deliveries),
    }));
  }
  private async targets(gymId: string, segment: GymOsReminderCampaignSegment) {
    const today = DateTime.utc().startOf('day');
    if (segment === GymOsReminderCampaignSegment.EXPIRING_IN_7_DAYS) {
      const d = today.plus({ days: 7 });
      return (
        await this.prisma.gymOsMembership.findMany({
          where: {
            gymId,
            status: 'ACTIVE',
            endDate: { gte: d.toJSDate(), lt: d.plus({ days: 1 }).toJSDate() },
          },
          select: { id: true, memberId: true, member: true },
        })
      ).map((x) => ({ ...x.member, id: x.memberId, subjectId: x.id, subjectType: 'MEMBERSHIP' }));
    }
    if (segment === GymOsReminderCampaignSegment.OVERDUE) {
      return (
        await this.prisma.gymOsMemberCharge.findMany({
          where: {
            gymId,
            status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
            dueDate: { lt: today.toJSDate() },
          },
          select: { id: true, memberId: true, member: true },
        })
      ).map((x) => ({ ...x.member, id: x.memberId, subjectId: x.id, subjectType: 'CHARGE' }));
    }
    const days = segment === GymOsReminderCampaignSegment.NO_VISIT_14_DAYS ? 14 : 7,
      cutoff = today.minus({ days }).toJSDate();
    if (segment === GymOsReminderCampaignSegment.NEW_MEMBER_NO_VISIT_7_DAYS) {
      return (
        await this.prisma.gymOsMembership.findMany({
          where: {
            gymId,
            status: 'ACTIVE',
            startDate: { lte: cutoff },
            attendances: { none: {} },
            member: { status: 'ACTIVE' },
          },
          distinct: ['memberId'],
          select: {
            id: true,
            memberId: true,
            member: {
              select: {
                phone: true,
                email: true,
                communicationPreference: true,
              },
            },
          },
        })
      ).map((x) => ({
        ...x.member,
        id: x.memberId,
        subjectId: x.id,
        subjectType: 'MEMBERSHIP',
      }));
    }
    return (
      await this.prisma.gymMember.findMany({
        where: {
          gymId,
          status: 'ACTIVE',
          memberships: {
            some: {
              status: 'ACTIVE',
            },
          },
          attendances: { none: { checkInAt: { gte: cutoff } } },
        },
        select: { id: true, phone: true, email: true, communicationPreference: true },
      })
    ).map((x) => ({ ...x, subjectId: x.id, subjectType: 'MEMBER' }));
  }
  private counts(
    targets: Array<{
      phone: string;
      email: string | null;
      communicationPreference?: {
        allowTransactional: boolean;
        allowWhatsApp: boolean;
        allowSms: boolean;
        allowEmail: boolean;
      } | null;
    }>,
    channel: string,
  ) {
    let eligible = 0,
      optedOut = 0,
      contactMissing = 0;
    for (const t of targets) {
      const pref = t.communicationPreference,
        allowed =
          !pref ||
          (pref.allowTransactional &&
            (channel === 'WHATSAPP'
              ? pref.allowWhatsApp
              : channel === 'SMS'
                ? pref.allowSms
                : pref.allowEmail)),
        contact = channel === 'EMAIL' ? t.email : t.phone;
      if (!allowed) optedOut++;
      else if (!contact) contactMissing++;
      else eligible++;
    }
    return {
      total: targets.length,
      eligible,
      optedOut,
      contactMissing,
      channelAvailable: eligible > 0,
    };
  }
  private deliverySummary(deliveries: Array<{ status: string }>) {
    return deliveries.reduce(
      (summary, delivery) => {
        const key = delivery.status.toLowerCase() as keyof typeof summary;
        if (key in summary) summary[key]++;
        return summary;
      },
      { scheduled: 0, processing: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0 },
    );
  }
  private async feature(gymId: string) {
    if (!(await this.entitlements.hasFeature(gymId, GymOsFeature.REMINDERS)))
      throw new DomainException(
        ApiErrorCode.GYMOS_REMINDERS_FEATURE_REQUIRED,
        'GymOS Reminders entitlement required',
        HttpStatus.PAYMENT_REQUIRED,
      );
  }
  private async write(user: AuthUser, gymId: string) {
    await this.access.assertGymOsMemberWrite(user, gymId);
    await this.feature(gymId);
  }
}
