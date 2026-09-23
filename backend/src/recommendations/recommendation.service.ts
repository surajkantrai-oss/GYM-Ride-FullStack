import { HttpStatus, Injectable } from '@nestjs/common';
import { FlexUsageStatus, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { pageMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { RecommendationCandidateService } from './recommendation-candidate.service';
import { RecommendationQueryDto, UpdateGymPreferenceDto } from './recommendation.dto';
import { RecommendationPolicy } from './recommendation.policy';

@Injectable()
export class RecommendationService {
  constructor(private readonly prisma: PrismaService, private readonly candidates: RecommendationCandidateService, private readonly policy: RecommendationPolicy) {}

  async recommend(customerId: string, query: RecommendationQueryDto): Promise<unknown> {
    this.validateContext(query);
    const [preference, flex] = await Promise.all([
      this.prisma.customerGymPreference.findUnique({ where: { userId: customerId } }),
      this.prisma.flexSubscription.findFirst({ where: { customerId, status: 'ACTIVE', expiresAt: { gt: new Date() } }, include: { primaryCity: true, secondaryCity: true, periods: { where: { status: 'ACTIVE', endsAt: { gt: new Date() } }, take: 1 } } }),
    ]);
    const flexCityIds: string[] = [];
    if (flex?.periods[0]) {
      const countedStatuses = [FlexUsageStatus.RESERVED, FlexUsageStatus.CONSUMED, FlexUsageStatus.FORFEITED];
      const [used, cityUsage] = await Promise.all([
        this.prisma.flexUsage.count({ where: { periodId: flex.periods[0].id, status: { in: countedStatuses } } }),
        this.prisma.flexUsage.groupBy({ by: ['serviceCityId'], where: { periodId: flex.periods[0].id, status: { in: countedStatuses } }, _count: { _all: true } }),
      ]);
      if (used < flex.periods[0].totalLimit) {
        const counts = new Map(cityUsage.map((item) => [item.serviceCityId, item._count._all]));
        if ((counts.get(flex.primaryCityId) ?? 0) < flex.periods[0].primaryCityLimit) flexCityIds.push(flex.primaryCityId);
        if (flex.secondaryCityId && (counts.get(flex.secondaryCityId) ?? 0) < flex.periods[0].secondaryCityLimit) flexCityIds.push(flex.secondaryCityId);
      }
    }
    if (query.flexOnly && !flexCityIds.length) return { data: [], meta: pageMeta(query.page, query.limit, 0), context: { personalized: true, locationUsed: false } };
    const fallbackCity = !query.city && query.latitude === undefined ? flex?.primaryCity.name : undefined;
    const radiusKm = query.radiusKm ?? preference?.preferredRadiusKm ?? 10;
    const desiredAmenities = query.amenities?.length ? query.amenities : preference?.preferredAmenities ?? [];
    const inferredDesiredAt = query.desiredAt ?? (preference?.preferredWorkoutHour == null ? undefined : this.nextHour(preference.preferredWorkoutHour).toISOString());
    const effective = { ...query, radiusKm, desiredAt: inferredDesiredAt };
    const rows = await this.candidates.generate(customerId, effective, fallbackCity, flexCityIds);
    const scored = rows.map((candidate) => ({
      candidate,
      ...this.policy.score({
        distanceMeters: candidate.distanceMeters, radiusKm, averageRating: candidate.averageRating, reviewCount: candidate.reviewCount,
        amenitySlugs: candidate.amenitySlugs, desiredAmenities,
        minPriceMinor: candidate.minPriceMinor,
        budgetMinMinor: query.budgetMinMinor ?? preference?.preferredBudgetMinMinor ?? undefined,
        budgetMaxMinor: query.budgetMaxMinor ?? preference?.preferredBudgetMaxMinor ?? undefined,
        availableSlotCount: candidate.availableSlotCount,
        preferredPlanMatch: preference?.preferredPlanType ? candidate.planTypes.includes(preference.preferredPlanType) : null,
        completedVisits: candidate.completedVisits, recentPopularity: candidate.recentPopularity,
        flexEligible: candidate.flexEligible, hasActiveFlex: flexCityIds.length > 0, openAtDesiredTime: candidate.openAtDesiredTime,
      }),
    })).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.candidate.distanceMeters !== null || b.candidate.distanceMeters !== null) return (a.candidate.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.candidate.distanceMeters ?? Number.MAX_SAFE_INTEGER);
      return a.candidate.branchId.localeCompare(b.candidate.branchId);
    });
    const diverse = this.diversify(scored);
    const total = diverse.length; const pageRows = diverse.slice((query.page - 1) * query.limit, query.page * query.limit);
    return {
      data: pageRows.map(({ candidate, score, reasons }) => ({
        gym: { id: candidate.gymId, name: candidate.gymName },
        branch: { id: candidate.branchId, name: candidate.branchName, city: candidate.city, latitude: candidate.latitude, longitude: candidate.longitude },
        distanceMeters: candidate.distanceMeters === null ? null : Math.round(candidate.distanceMeters), averageRating: candidate.averageRating, reviewCount: candidate.reviewCount,
        startingPriceMinor: candidate.minPriceMinor, currency: candidate.currency, planTypes: candidate.planTypes, amenities: candidate.amenityNames,
        flexEligible: candidate.flexEligible && flexCityIds.length > 0, availability: { availableSlots: candidate.availableSlotCount, openAtDesiredTime: candidate.openAtDesiredTime }, score, reasons,
      })),
      meta: pageMeta(query.page, query.limit, total),
      context: { personalized: Boolean(preference || flex), locationUsed: query.latitude !== undefined, city: query.city ?? fallbackCity ?? null, radiusKm },
    };
  }

  preference(customerId: string): Promise<unknown> { return this.prisma.customerGymPreference.findUnique({ where: { userId: customerId } }); }
  async updatePreference(customerId: string, dto: UpdateGymPreferenceDto): Promise<unknown> {
    if (dto.preferredBudgetMinMinor != null && dto.preferredBudgetMaxMinor != null && dto.preferredBudgetMinMinor > dto.preferredBudgetMaxMinor) this.fail(ApiErrorCode.PREFERENCE_VALIDATION_ERROR, 'Minimum budget cannot exceed maximum budget');
    const amenities = dto.preferredAmenities ? [...new Set(dto.preferredAmenities.map((item) => item.trim().toLowerCase()).filter(Boolean))] : undefined;
    if (amenities?.length && await this.prisma.amenity.count({ where: { slug: { in: amenities } } }) !== amenities.length) this.fail(ApiErrorCode.PREFERENCE_VALIDATION_ERROR, 'One or more amenity codes are invalid');
    const data: Prisma.CustomerGymPreferenceUncheckedUpdateInput = { ...dto, ...(amenities && { preferredAmenities: amenities }), version: { increment: 1 } };
    return this.prisma.customerGymPreference.upsert({ where: { userId: customerId }, create: { userId: customerId, ...dto, ...(amenities && { preferredAmenities: amenities }) }, update: data });
  }
  private validateContext(query: RecommendationQueryDto): void {
    if ((query.latitude === undefined) !== (query.longitude === undefined)) this.fail(ApiErrorCode.RECOMMENDATION_CONTEXT_INVALID, 'Latitude and longitude must be supplied together');
    if (query.budgetMinMinor !== undefined && query.budgetMaxMinor !== undefined && query.budgetMinMinor > query.budgetMaxMinor) this.fail(ApiErrorCode.RECOMMENDATION_CONTEXT_INVALID, 'Minimum budget cannot exceed maximum budget');
  }
  private nextHour(hour: number): Date {
    const value = new Date(); value.setMinutes(0, 0, 0); value.setHours(hour);
    if (value <= new Date()) value.setDate(value.getDate() + 1);
    return value;
  }
  private diversify<T extends { candidate: { gymId: string } }>(rows: T[]): T[] {
    const result = [...rows];
    for (let index = 2; index < result.length; index++) {
      const current = result[index]; const previous = result[index - 1]; const earlier = result[index - 2];
      if (!current || !previous || !earlier || current.candidate.gymId !== previous.candidate.gymId || current.candidate.gymId !== earlier.candidate.gymId) continue;
      const alternative = result.findIndex((item, next) => next > index && item.candidate.gymId !== current.candidate.gymId);
      const replacement = result[alternative];
      if (alternative > index && replacement) {
        result.splice(index, 1, replacement);
        result.splice(alternative, 1, current);
      }
    }
    return result;
  }
  private fail(code: ApiErrorCode, message: string): never { throw new DomainException(code, message, HttpStatus.BAD_REQUEST); }
}
