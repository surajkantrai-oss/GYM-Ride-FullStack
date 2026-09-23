import { Injectable } from '@nestjs/common';
import { PlanType, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service';
import { RecommendationQueryDto } from './recommendation.dto';

export interface RecommendationCandidate {
  gymId: string; gymName: string; branchId: string; branchName: string; city: string; latitude: number; longitude: number; timezone: string;
  distanceMeters: number | null; amenitySlugs: string[]; amenityNames: string[]; averageRating: number | null; reviewCount: number;
  minPriceMinor: number; currency: string; planTypes: PlanType[]; availableSlotCount: number; completedVisits: number; recentPopularity: number; flexEligible: boolean; openAtDesiredTime: boolean | null;
}
type Row = Omit<RecommendationCandidate, 'latitude' | 'longitude' | 'openAtDesiredTime'> & { latitude: Prisma.Decimal; longitude: Prisma.Decimal };

@Injectable()
export class RecommendationCandidateService {
  constructor(private readonly prisma: PrismaService) {}
  async generate(customerId: string, query: RecommendationQueryDto, fallbackCity?: string, activeFlexCityIds: string[] = []): Promise<RecommendationCandidate[]> {
    const hasPoint = query.latitude !== undefined && query.longitude !== undefined;
    const point = hasPoint ? Prisma.sql`ST_SetSRID(ST_MakePoint(${Number(query.longitude)}, ${Number(query.latitude)}), 4326)::geography` : Prisma.empty;
    const city = query.city?.trim() || fallbackCity;
    const amenityFilter = query.amenities?.length ? Prisma.sql`AND (SELECT COUNT(DISTINCT a2.slug) FROM branch_amenities ba2 JOIN amenities a2 ON a2.id = ba2.amenity_id WHERE ba2.branch_id = b.id AND a2.slug IN (${Prisma.join(query.amenities)})) = ${query.amenities.length}` : Prisma.empty;
    const planFilter = query.planType ? Prisma.sql`AND EXISTS (SELECT 1 FROM plan_branches pbf JOIN gym_plans gpf ON gpf.id = pbf.plan_id WHERE pbf.branch_id = b.id AND gpf.status = 'ACTIVE'::"PlanStatus" AND gpf.type = ${query.planType}::"PlanType")` : Prisma.empty;
    const cityFilter = city ? Prisma.sql`AND lower(b.city) = lower(${city})` : Prisma.empty;
    const radiusFilter = hasPoint ? Prisma.sql`AND ST_DWithin(b.location, ${point}, ${(query.radiusKm ?? 10) * 1000})` : Prisma.empty;
    const eligibleFlexCities = activeFlexCityIds.length ? activeFlexCityIds : ['00000000-0000-0000-0000-000000000000'];
    const flexFilter = query.flexOnly ? Prisma.sql`AND fp.id IS NOT NULL AND fp.service_city_id = ANY(${eligibleFlexCities}::uuid[])` : Prisma.empty;
    const desired = query.desiredAt ? new Date(query.desiredAt) : new Date();
    const windowStart = new Date(desired.getTime() - 2 * 3_600_000);
    const windowEnd = new Date(desired.getTime() + 2 * 3_600_000);
    const distanceSelect = hasPoint ? Prisma.sql`ST_Distance(b.location, ${point})::float8` : Prisma.sql`NULL::float8`;
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT g.id AS "gymId", g.name AS "gymName", b.id AS "branchId", b.name AS "branchName", b.city, b.latitude, b.longitude, b.timezone,
        ${distanceSelect} AS "distanceMeters",
        COALESCE(array_agg(DISTINCT a.slug) FILTER (WHERE a.slug IS NOT NULL), ARRAY[]::varchar[]) AS "amenitySlugs",
        COALESCE(array_agg(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL), ARRAY[]::varchar[]) AS "amenityNames",
        (SELECT AVG(r.rating)::float8 FROM reviews r WHERE r.gym_id = g.id AND r.status = 'PUBLISHED'::"ReviewStatus") AS "averageRating",
        (SELECT COUNT(*)::int FROM reviews r WHERE r.gym_id = g.id AND r.status = 'PUBLISHED'::"ReviewStatus") AS "reviewCount",
        MIN(gp.price_minor)::int AS "minPriceMinor", MIN(gp.currency) AS currency,
        array_agg(DISTINCT gp.type) AS "planTypes",
        (SELECT COUNT(*)::int FROM slot_instances s WHERE s.branch_id = b.id AND s.status = 'AVAILABLE'::"SlotStatus" AND s.start_at BETWEEN ${windowStart} AND ${windowEnd} AND s.capacity > (SELECT COUNT(*) FROM bookings sb WHERE sb.slot_id = s.id AND sb.status IN ('CONFIRMED'::"BookingStatus", 'CHECK_IN_AVAILABLE'::"BookingStatus", 'CHECKED_IN'::"BookingStatus"))) AS "availableSlotCount",
        (SELECT COUNT(*)::int FROM bookings hb WHERE hb.user_id = ${customerId}::uuid AND hb.branch_id = b.id AND hb.status = 'COMPLETED'::"BookingStatus") AS "completedVisits",
        (SELECT COUNT(*)::int FROM bookings pb WHERE pb.branch_id = b.id AND pb.status = 'COMPLETED'::"BookingStatus" AND pb.completed_at >= NOW() - INTERVAL '30 days') AS "recentPopularity",
        (fp.id IS NOT NULL AND fp.service_city_id = ANY(${activeFlexCityIds}::uuid[])) AS "flexEligible"
      FROM gyms g
      JOIN gym_branches b ON b.gym_id = g.id
      JOIN plan_branches pbl ON pbl.branch_id = b.id
      JOIN gym_plans gp ON gp.id = pbl.plan_id AND gp.status = 'ACTIVE'::"PlanStatus"
      LEFT JOIN branch_amenities ba ON ba.branch_id = b.id LEFT JOIN amenities a ON a.id = ba.amenity_id
      LEFT JOIN gym_flex_participations fp ON fp.branch_id = b.id AND fp.enabled = true AND (fp.effective_from IS NULL OR fp.effective_from <= NOW()) AND (fp.effective_to IS NULL OR fp.effective_to > NOW())
      WHERE g.status = 'APPROVED'::"GymStatus" AND b.status = 'ACTIVE'::"BranchStatus" ${cityFilter} ${radiusFilter} ${amenityFilter} ${planFilter} ${flexFilter}
      GROUP BY g.id, g.name, b.id, fp.id, fp.service_city_id
      ORDER BY b.id ASC LIMIT 200`);
    const hours = query.desiredAt && rows.length ? await this.prisma.operatingHours.findMany({ where: { branchId: { in: rows.map((row) => row.branchId) } } }) : [];
    return rows.map((row) => ({ ...row, latitude: Number(row.latitude), longitude: Number(row.longitude), openAtDesiredTime: query.desiredAt ? this.isOpen(row.branchId, row.timezone, desired, hours) : null }));
  }
  private isOpen(branchId: string, timezone: string, desired: Date, hours: Array<{ branchId: string; weekday: string; opensAt: Date | null; closesAt: Date | null; isClosed: boolean }>): boolean {
    const local = DateTime.fromJSDate(desired).setZone(timezone);
    const weekday = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'][local.weekday - 1];
    const minute = local.hour * 60 + local.minute;
    return hours.some((item) => item.branchId === branchId && item.weekday === weekday && !item.isClosed && item.opensAt && item.closesAt && minute >= item.opensAt.getUTCHours() * 60 + item.opensAt.getUTCMinutes() && minute < item.closesAt.getUTCHours() * 60 + item.closesAt.getUTCMinutes());
  }
}
