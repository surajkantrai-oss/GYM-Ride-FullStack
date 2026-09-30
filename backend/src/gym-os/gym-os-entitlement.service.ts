/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Injectable } from '@nestjs/common';
import { GymOsFeature, GymOsSubscriptionStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class GymOsEntitlementService {
  constructor(private readonly prisma: PrismaService) {}
  async getEffectiveEntitlements(gymId: string) {
    const subscription = await this.prisma.gymOsSubscription.findFirst({
      where: { gymId, status: GymOsSubscriptionStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) return { gymId, subscribed: false, features: [] as GymOsFeature[], limits: null };
    const now = new Date();
    const end = subscription.trialEnd ?? subscription.currentPeriodEnd;
    if (end && end <= now) return { gymId, subscribed: false, subscriptionStatus: 'EXPIRED', features: [] as GymOsFeature[], limits: null };
    const currentUsage = await this.prisma.gymMember.count({ where: { gymId, status: 'ACTIVE' } });
    return {
      gymId, subscribed: true, subscriptionStatus: subscription.status,
      plan: { code: subscription.planCodeSnapshot, name: subscription.planNameSnapshot },
      period: { start: subscription.currentPeriodStart ?? subscription.trialStart, end },
      limits: { members: subscription.memberLimitSnapshot, branches: subscription.branchLimitSnapshot },
      memberUsage: { currentUsage, limit: subscription.memberLimitSnapshot, overLimit: currentUsage > subscription.memberLimitSnapshot },
      features: subscription.featuresSnapshot,
    };
  }
  async hasFeature(gymId: string, feature: GymOsFeature): Promise<boolean> {
    const value = await this.getEffectiveEntitlements(gymId);
    return value.subscribed && value.features.includes(feature);
  }
  async assertFeature(gymId: string, feature: GymOsFeature): Promise<void> {
    const value = await this.getEffectiveEntitlements(gymId);
    if (!value.subscribed) throw new DomainException(ApiErrorCode.GYMOS_SUBSCRIPTION_INACTIVE, 'An active GymOS subscription is required', HttpStatus.PAYMENT_REQUIRED);
    if (!value.features.includes(feature)) throw new DomainException(ApiErrorCode.GYMOS_FEATURE_NOT_INCLUDED, 'This GymOS feature is not included', HttpStatus.FORBIDDEN);
  }
}
