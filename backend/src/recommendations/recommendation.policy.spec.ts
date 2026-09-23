import { RecommendationPolicy } from './recommendation.policy';

const base = { distanceMeters: 1000, radiusKm: 10, averageRating: 4.5, reviewCount: 20, amenitySlugs: ['parking'], desiredAmenities: ['parking'], minPriceMinor: 50000, availableSlotCount: 2, preferredPlanMatch: null as boolean | null, completedVisits: 0, recentPopularity: 0, flexEligible: false, hasActiveFlex: false, openAtDesiredTime: null as boolean | null };

describe('RecommendationPolicy', () => {
  const policy = new RecommendationPolicy();
  it('uses a stable 0–100 score', () => { const result = policy.score(base); expect(result.score).toBeGreaterThanOrEqual(0); expect(result.score).toBeLessThanOrEqual(100); expect(policy.score(base)).toEqual(result); });
  it('ranks an otherwise identical closer branch higher', () => expect(policy.score({ ...base, distanceMeters: 100 }).score).toBeGreaterThan(policy.score({ ...base, distanceMeters: 9000 }).score));
  it('uses review confidence rather than raw average alone', () => expect(policy.score({ ...base, averageRating: 4.8, reviewCount: 500 }).score).toBeGreaterThan(policy.score({ ...base, averageRating: 5, reviewCount: 1 }).score));
  it('scores a full amenity match higher', () => expect(policy.score(base).score).toBeGreaterThan(policy.score({ ...base, amenitySlugs: [] }).score));
  it('rewards a budget-compatible price', () => expect(policy.score({ ...base, budgetMaxMinor: 60000 }).score).toBeGreaterThan(policy.score({ ...base, budgetMaxMinor: 10000 }).score));
  it('rewards authoritative slot availability', () => expect(policy.score(base).score).toBeGreaterThan(policy.score({ ...base, availableSlotCount: 0 }).score));
  it('adds bounded history affinity without eliminating discovery', () => { const known = policy.score({ ...base, completedVisits: 10 }); const newGym = policy.score(base); expect(known.score).toBeGreaterThan(newGym.score); expect(known.score - newGym.score).toBeLessThan(10); });
  it('boosts Flex eligibility only with an active entitlement', () => expect(policy.score({ ...base, flexEligible: true, hasActiveFlex: true }).score).toBeGreaterThan(policy.score({ ...base, flexEligible: true, hasActiveFlex: false }).score));
  it('rewards desired-time compatibility', () => expect(policy.score({ ...base, openAtDesiredTime: true }).score).toBeGreaterThan(policy.score({ ...base, openAtDesiredTime: false }).score));
  it('returns deterministic controlled reason codes', () => expect(policy.score({ ...base, distanceMeters: 100, budgetMaxMinor: 60000, flexEligible: true, hasActiveFlex: true, completedVisits: 1 }).reasons).toEqual(['NEAR_YOU', 'HIGHLY_RATED', 'MATCHES_AMENITIES', 'FITS_BUDGET']));
});
