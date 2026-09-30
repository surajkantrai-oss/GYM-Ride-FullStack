import { GymOsFeature, GymOsSubscriptionStatus } from '@prisma/client';
import { GymOsEntitlementService } from './gym-os-entitlement.service';

describe('GymOsEntitlementService', () => {
  const future = new Date(Date.now() + 86_400_000);
  const active = { status: GymOsSubscriptionStatus.ACTIVE, currentPeriodStart: new Date(), currentPeriodEnd: future, trialEnd: null, trialStart: null, planCodeSnapshot: 'GYMOS_GROWTH', planNameSnapshot: 'Growth', memberLimitSnapshot: 500, branchLimitSnapshot: 3, featuresSnapshot: [GymOsFeature.MEMBERS, GymOsFeature.ATTENDANCE] };
  const service = (value: unknown) => new GymOsEntitlementService({ gymOsSubscription: { findFirst: jest.fn().mockResolvedValue(value) }, gymMember: { count: jest.fn().mockResolvedValue(12) } } as never);
  it('returns gym-scoped limits and features for active subscriptions', async () => expect(service(active).getEffectiveEntitlements('gym-a')).resolves.toMatchObject({ gymId: 'gym-a', subscribed: true, limits: { members: 500, branches: 3 } }));
  it('returns no entitlement when no subscription exists', async () => expect(service(null).getEffectiveEntitlements('gym-a')).resolves.toMatchObject({ subscribed: false, features: [] }));
  it('queries only ACTIVE subscriptions so trials and pending payments cannot unlock features', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const guarded = new GymOsEntitlementService({ gymOsSubscription: { findFirst }, gymMember: { count: jest.fn() } } as never);
    await expect(guarded.getEffectiveEntitlements('gym-a')).resolves.toMatchObject({ subscribed: false, features: [] });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { gymId: 'gym-a', status: GymOsSubscriptionStatus.ACTIVE } }));
  });
  it('rejects an unavailable feature', async () => expect(service(active).assertFeature('gym-a', GymOsFeature.CRM)).rejects.toMatchObject({ status: 403 }));
  it('allows an included feature', async () => expect(service(active).assertFeature('gym-a', GymOsFeature.ATTENDANCE)).resolves.toBeUndefined());
  it('treats an elapsed period as expired at request time', async () => expect(service({ ...active, currentPeriodEnd: new Date(Date.now() - 1000) }).getEffectiveEntitlements('gym-a')).resolves.toMatchObject({ subscribed: false, subscriptionStatus: 'EXPIRED' }));
  it('returns member usage and over-limit state', async () => expect(service({ ...active, memberLimitSnapshot: 10 }).getEffectiveEntitlements('gym-a')).resolves.toMatchObject({ memberUsage: { currentUsage: 12, limit: 10, overLimit: true } }));
});
