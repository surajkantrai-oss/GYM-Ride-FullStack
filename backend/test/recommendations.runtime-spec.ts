import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service';
import { RecommendationCandidateService } from '../src/recommendations/recommendation-candidate.service';
import { RecommendationPolicy } from '../src/recommendations/recommendation.policy';
import { RecommendationService } from '../src/recommendations/recommendation.service';

describe('PostgreSQL deterministic recommendations', () => {
  const url = process.env.FINANCE_TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/gymride_finance_test') throw new Error('Use test/run-finance-runtime.cjs');
  const prisma = new PrismaService({ datasourceUrl: url });
  const candidates = new RecommendationCandidateService(prisma);
  const service = new RecommendationService(prisma, candidates, new RecommendationPolicy());
  afterAll(async () => prisma.$disconnect());

  async function branchFixture() {
    const customer = await prisma.user.create({ data: { email: `${randomUUID()}@recommend.invalid`, status: 'ACTIVE' } });
    const owner = await prisma.user.create({ data: { email: `${randomUUID()}@recommend.invalid`, status: 'ACTIVE' } });
    const amenity = await prisma.amenity.upsert({ where: { slug: `parking-${randomUUID()}` }, create: { slug: `parking-${randomUUID()}`, name: `Parking ${randomUUID()}` }, update: {} });
    const desired = new Date(Date.now() + 3_600_000);
    const make = async (name: string, longitude: number, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') => {
      const gym = await prisma.gym.create({ data: { name, ownerId: owner.id, status: 'APPROVED' } });
      const branch = await prisma.gymBranch.create({ data: { gymId: gym.id, name: `${name} branch`, address: 'Test', city: 'Pune', state: 'Maharashtra', postalCode: '411001', latitude: 18.5204, longitude, status, amenities: status === 'ACTIVE' ? { create: { amenityId: amenity.id } } : undefined } });
      const plan = await prisma.gymPlan.create({ data: { gymId: gym.id, name: 'Day pass', type: 'DAY_PASS', status: 'ACTIVE', priceMinor: 50000, durationDays: 1, branches: { create: { branchId: branch.id } } } });
      if (status === 'ACTIVE') await prisma.slotInstance.create({ data: { branchId: branch.id, startAt: desired, endAt: new Date(desired.getTime() + 3_600_000), capacity: 10 } });
      return { gym, branch, plan };
    };
    const near = await make('Near gym', 73.8568);
    const far = await make('Far gym', 73.9168);
    const inactive = await make('Inactive gym', 73.8668, 'INACTIVE');
    return { customer, owner, amenity, desired, near, far, inactive };
  }

  it('uses PostGIS distance, hard amenity/city filters, and excludes inactive branches', async () => {
    const f = await branchFixture();
    const result = await service.recommend(f.customer.id, { latitude: '18.5204', longitude: '73.8567', radiusKm: 20, city: 'Pune', amenities: [f.amenity.slug], page: 1, limit: 20 }) as { data: Array<{ branch: { id: string }; distanceMeters: number }> };
    expect(result.data.map((item) => item.branch.id)).toEqual([f.near.branch.id, f.far.branch.id]);
    expect(result.data[0]!.distanceMeters).toBeLessThan(result.data[1]!.distanceMeters);
    expect(result.data.some((item) => item.branch.id === f.inactive.branch.id)).toBe(false);
  });

  it('works as a deterministic no-location cold start', async () => {
    const f = await branchFixture();
    const query = { city: 'Pune', page: 1, limit: 20 };
    const first = await service.recommend(f.customer.id, query) as { data: Array<{ branch: { id: string }; score: number }> };
    const second = await service.recommend(f.customer.id, query) as typeof first;
    expect(first.data).toEqual(second.data); expect(first.data.length).toBeGreaterThanOrEqual(2);
  });

  it('uses published rating confidence and completed-booking history', async () => {
    const f = await branchFixture();
    const reviewer = await prisma.user.create({ data: { email: `${randomUUID()}@recommend.invalid`, status: 'ACTIVE' } });
    const slot = await prisma.slotInstance.findFirstOrThrow({ where: { branchId: f.near.branch.id } });
    const booking = await prisma.booking.create({ data: { userId: reviewer.id, gymId: f.near.gym.id, branchId: f.near.branch.id, planId: f.near.plan.id, slotId: slot.id, status: 'COMPLETED', planName: f.near.plan.name, planType: 'DAY_PASS', priceMinor: 50000, currency: 'INR', idempotencyKey: randomUUID(), requestFingerprint: 'a'.repeat(64), completedAt: new Date() } });
    await prisma.review.create({ data: { bookingId: booking.id, customerId: reviewer.id, gymId: f.near.gym.id, branchId: f.near.branch.id, rating: 5, status: 'PUBLISHED' } });
    const farSlot = await prisma.slotInstance.findFirstOrThrow({ where: { branchId: f.far.branch.id } });
    await prisma.booking.create({ data: { userId: f.customer.id, gymId: f.far.gym.id, branchId: f.far.branch.id, planId: f.far.plan.id, slotId: farSlot.id, status: 'COMPLETED', planName: f.far.plan.name, planType: 'DAY_PASS', priceMinor: 50000, currency: 'INR', idempotencyKey: randomUUID(), requestFingerprint: 'b'.repeat(64), completedAt: new Date() } });
    const result = await service.recommend(f.customer.id, { city: 'Pune', page: 1, limit: 20 }) as { data: Array<{ branch: { id: string }; reviewCount: number; reasons: string[] }> };
    expect(result.data.find((item) => item.branch.id === f.near.branch.id)?.reviewCount).toBe(1);
    expect(result.data.find((item) => item.branch.id === f.far.branch.id)?.reasons).toContain('PREVIOUSLY_VISITED');
  });

  it('returns only eligible branches for Flex-only context', async () => {
    const f = await branchFixture();
    const city = await prisma.serviceCity.create({ data: { code: randomUUID(), name: 'Pune', state: 'Maharashtra' } });
    const plan = await prisma.flexPlan.create({ data: { code: randomUUID(), name: 'Recommend Flex', status: 'ACTIVE', priceMinor: 100000, durationDays: 30, totalUsageLimit: 2, primaryCityLimit: 2, secondaryCityLimit: 0 } });
    const subscription = await prisma.flexSubscription.create({ data: { customerId: f.customer.id, flexPlanId: plan.id, status: 'ACTIVE', primaryCityId: city.id, idempotencyKey: randomUUID(), planName: plan.name, planCode: plan.code, priceMinor: plan.priceMinor, currency: 'INR', durationDays: 30, totalUsageLimit: 2, primaryCityLimit: 2, secondaryCityLimit: 0, dailyUsageLimit: 1, bookingAdvanceDays: 14, eligiblePlanTypes: ['DAY_PASS'], policyVersion: 'v1', startedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) } });
    await prisma.flexUsagePeriod.create({ data: { subscriptionId: subscription.id, startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), totalLimit: 2, primaryCityLimit: 2, secondaryCityLimit: 0 } });
    await prisma.gymFlexParticipation.create({ data: { gymId: f.near.gym.id, branchId: f.near.branch.id, serviceCityId: city.id, enabled: true } });
    const result = await service.recommend(f.customer.id, { flexOnly: true, page: 1, limit: 20 }) as { data: Array<{ branch: { id: string }; flexEligible: boolean }> };
    expect(result.data).toEqual([expect.objectContaining({ branch: expect.objectContaining({ id: f.near.branch.id }), flexEligible: true })]);
  });

  it('persists only the authenticated customer preference and validates amenities', async () => {
    const f = await branchFixture();
    await service.updatePreference(f.customer.id, { preferredAmenities: [f.amenity.slug], preferredRadiusKm: 7, preferredBudgetMaxMinor: 60000 });
    const stored = await prisma.customerGymPreference.findUniqueOrThrow({ where: { userId: f.customer.id } });
    expect(stored.preferredRadiusKm).toBe(7); expect(stored.preferredAmenities).toEqual([f.amenity.slug]);
    await expect(service.updatePreference(f.owner.id, { preferredAmenities: ['not-real'] })).rejects.toMatchObject({ response: { code: 'PREFERENCE_VALIDATION_ERROR' } });
  });
});
