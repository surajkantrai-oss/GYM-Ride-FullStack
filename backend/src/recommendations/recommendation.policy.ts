import { Injectable } from '@nestjs/common';

export const RECOMMENDATION_WEIGHTS = Object.freeze({
  distance: 25,
  rating: 15,
  amenities: 10,
  price: 10,
  availability: 15,
  history: 10,
  flex: 10,
  time: 5,
});

export type RecommendationReason = 'NEAR_YOU' | 'HIGHLY_RATED' | 'MATCHES_AMENITIES' | 'FITS_BUDGET' | 'AVAILABLE_AT_PREFERRED_TIME' | 'FLEX_ELIGIBLE' | 'PREVIOUSLY_VISITED' | 'POPULAR_WITH_CUSTOMERS';
export interface ScoreInput { distanceMeters: number | null; radiusKm: number; averageRating: number | null; reviewCount: number; amenitySlugs: string[]; desiredAmenities: string[]; minPriceMinor: number; budgetMinMinor?: number; budgetMaxMinor?: number; availableSlotCount: number; preferredPlanMatch: boolean | null; completedVisits: number; recentPopularity: number; flexEligible: boolean; hasActiveFlex: boolean; openAtDesiredTime: boolean | null; }

@Injectable()
export class RecommendationPolicy {
  score(input: ScoreInput): { score: number; reasons: RecommendationReason[] } {
    const distance = input.distanceMeters === null ? 50 : Math.max(0, 100 * (1 - input.distanceMeters / (input.radiusKm * 1000)));
    const confidence = input.reviewCount / (input.reviewCount + 10);
    const adjustedRating = ((input.averageRating ?? 4) * confidence) + (4 * (1 - confidence));
    const rating = adjustedRating * 20;
    const amenities = input.desiredAmenities.length ? 100 * input.desiredAmenities.filter((slug) => input.amenitySlugs.includes(slug)).length / input.desiredAmenities.length : 50;
    const price = this.priceScore(input.minPriceMinor, input.budgetMinMinor, input.budgetMaxMinor);
    const availability = input.availableSlotCount > 0 ? (input.preferredPlanMatch === false ? 70 : 100) : 0;
    const history = input.completedVisits ? Math.min(80, 50 + input.completedVisits * 10) : 40;
    const flex = input.hasActiveFlex ? (input.flexEligible ? 100 : 0) : 50;
    const time = input.openAtDesiredTime === null ? 50 : input.openAtDesiredTime ? 100 : 0;
    const values = { distance, rating, amenities, price, availability, history, flex, time };
    const score = Math.round(Object.entries(RECOMMENDATION_WEIGHTS).reduce((sum, [key, weight]) => sum + values[key as keyof typeof values] * weight, 0) / 100);
    const reasons: RecommendationReason[] = [];
    if (distance >= 70) reasons.push('NEAR_YOU');
    if (adjustedRating >= 4.2 && input.reviewCount >= 3) reasons.push('HIGHLY_RATED');
    if (input.desiredAmenities.length && amenities === 100) reasons.push('MATCHES_AMENITIES');
    if ((input.budgetMinMinor !== undefined || input.budgetMaxMinor !== undefined) && price === 100) reasons.push('FITS_BUDGET');
    if (input.availableSlotCount > 0 && input.openAtDesiredTime !== false) reasons.push('AVAILABLE_AT_PREFERRED_TIME');
    if (input.flexEligible && input.hasActiveFlex) reasons.push('FLEX_ELIGIBLE');
    if (input.completedVisits > 0) reasons.push('PREVIOUSLY_VISITED');
    if (input.recentPopularity >= 5) reasons.push('POPULAR_WITH_CUSTOMERS');
    return { score, reasons: reasons.slice(0, 4) };
  }
  private priceScore(price: number, min?: number, max?: number): number {
    if (min === undefined && max === undefined) return 50;
    if ((min === undefined || price >= min) && (max === undefined || price <= max)) return 100;
    const boundary = price < (min ?? 0) ? min! : max!;
    return Math.max(0, 100 - Math.abs(price - boundary) / Math.max(boundary, 1) * 100);
  }
}
