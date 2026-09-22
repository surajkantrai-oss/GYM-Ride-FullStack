import { HttpStatus, Injectable } from '@nestjs/common';
import { BranchStatus, GymStatus, Prisma, ReviewStatus } from '@prisma/client';
import { pageMeta } from '../common/dto/pagination.dto';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { PrismaService } from '../database/prisma.service';
import { GymListDto } from './dto/gym.dto';
import { NearbyGymsDto } from './dto/nearby.dto';

const publicGymSelect = {
  id: true,
  name: true,
  description: true,
  branches: {
    where: { status: BranchStatus.ACTIVE },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      latitude: true,
      longitude: true,
      phone: true,
      email: true,
      timezone: true,
      amenities: { select: { amenity: { select: { id: true, slug: true, name: true } } } },
      operatingHours: {
        select: { weekday: true, period: true, opensAt: true, closesAt: true, isClosed: true },
        orderBy: [{ weekday: 'asc' as const }, { period: 'asc' as const }],
      },
    },
  },
} satisfies Prisma.GymSelect;

interface NearbyRow {
  gymId: string;
  gymName: string;
  branchId: string;
  branchName: string;
  city: string;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  distanceMeters: number;
  amenities: string[];
  averageRating: number | null;
  reviewCount: number;
}

@Injectable()
export class PublicGymsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: GymListDto): Promise<unknown> {
    const amenities = this.csv(query.amenities);
    const branchWhere: Prisma.GymBranchWhereInput = {
      status: BranchStatus.ACTIVE,
      ...(query.city && { city: { equals: query.city, mode: 'insensitive' } }),
      ...(query.state && { state: { equals: query.state, mode: 'insensitive' } }),
      ...(amenities.length && { amenities: { some: { amenity: { slug: { in: amenities } } } } }),
    };
    const where: Prisma.GymWhereInput = {
      status: GymStatus.APPROVED,
      branches: { some: branchWhere },
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          {
            branches: {
              some: {
                status: BranchStatus.ACTIVE,
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { city: { contains: query.search, mode: 'insensitive' } },
                  { address: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.gym.findMany({
        where,
        select: publicGymSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.gym.count({ where }),
    ]);
    const ratings = await this.ratings(data.map((gym) => gym.id));
    return { data: data.map((gym) => ({ ...gym, ...this.ratingFor(ratings, gym.id) })), meta: pageMeta(query.page, query.limit, total) };
  }
  async nearby(query: NearbyGymsDto): Promise<unknown> {
    const latitude = Number(query.latitude);
    const longitude = Number(query.longitude);
    const radiusMeters = query.radiusKm * 1000;
    const offset = (query.page - 1) * query.limit;
    const amenities = this.csv(query.amenities);
    const amenityClause = amenities.length
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM branch_amenities filter_ba JOIN amenities filter_a ON filter_a.id = filter_ba.amenity_id WHERE filter_ba.branch_id = b.id AND filter_a.slug IN (${Prisma.join(amenities)}))`
      : Prisma.empty;
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
    const rows = await this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
      SELECT g.id AS "gymId", g.name AS "gymName", b.id AS "branchId", b.name AS "branchName",
        b.city, b.latitude, b.longitude, ST_Distance(b.location, ${point})::float8 AS "distanceMeters",
        COALESCE((SELECT array_agg(a.name ORDER BY a.name) FROM branch_amenities ba JOIN amenities a ON a.id = ba.amenity_id WHERE ba.branch_id = b.id), ARRAY[]::varchar[]) AS amenities,
        (SELECT AVG(r.rating)::float8 FROM reviews r WHERE r.gym_id = g.id AND r.status = 'PUBLISHED'::"ReviewStatus") AS "averageRating",
        (SELECT COUNT(*)::int FROM reviews r WHERE r.gym_id = g.id AND r.status = 'PUBLISHED'::"ReviewStatus") AS "reviewCount"
      FROM gyms g JOIN gym_branches b ON b.gym_id = g.id
      WHERE g.status = 'APPROVED'::"GymStatus" AND b.status = 'ACTIVE'::"BranchStatus"
        AND ST_DWithin(b.location, ${point}, ${radiusMeters}) ${amenityClause}
      ORDER BY ST_Distance(b.location, ${point}) ASC, b.id ASC LIMIT ${query.limit} OFFSET ${offset}`);
    return {
      data: rows.map((row) => ({
        gymId: row.gymId,
        gymName: row.gymName,
        branch: {
          id: row.branchId,
          name: row.branchName,
          city: row.city,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        },
        distanceMeters: Math.round(row.distanceMeters),
        amenities: row.amenities,
        averageRating: row.averageRating,
        reviewCount: row.reviewCount,
      })),
      meta: { page: query.page, limit: query.limit, hasMore: rows.length === query.limit },
    };
  }
  async getGym(gymId: string): Promise<unknown> {
    const gym = await this.prisma.gym.findFirst({
      where: {
        id: gymId,
        status: GymStatus.APPROVED,
        branches: { some: { status: BranchStatus.ACTIVE } },
      },
      select: publicGymSelect,
    });
    if (!gym) this.gymNotFound();
    const ratings = await this.ratings([gym.id]);
    return { ...gym, ...this.ratingFor(ratings, gym.id) };
  }
  async getBranch(branchId: string): Promise<unknown> {
    const branch = await this.prisma.gymBranch.findFirst({
      where: { id: branchId, status: BranchStatus.ACTIVE, gym: { status: GymStatus.APPROVED } },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        latitude: true,
        longitude: true,
        phone: true,
        email: true,
        timezone: true,
        gym: { select: { id: true, name: true, description: true } },
        amenities: { select: { amenity: { select: { id: true, slug: true, name: true } } } },
        operatingHours: {
          select: { weekday: true, period: true, opensAt: true, closesAt: true, isClosed: true },
          orderBy: [{ weekday: 'asc' }, { period: 'asc' }],
        },
      },
    });
    if (!branch)
      throw new DomainException(
        ApiErrorCode.BRANCH_NOT_FOUND,
        'Branch not found',
        HttpStatus.NOT_FOUND,
      );
    const rating = await this.prisma.review.aggregate({ where: { branchId, status: ReviewStatus.PUBLISHED }, _avg: { rating: true }, _count: { rating: true } });
    return { ...branch, averageRating: rating._avg.rating, reviewCount: rating._count.rating };
  }
  private async ratings(gymIds: string[]): Promise<Map<string, { averageRating: number | null; reviewCount: number }>> {
    if (!gymIds.length) return new Map();
    const groups = await this.prisma.review.groupBy({ by: ['gymId'], where: { gymId: { in: gymIds }, status: ReviewStatus.PUBLISHED }, _avg: { rating: true }, _count: { rating: true } });
    return new Map(groups.map((row) => [row.gymId, { averageRating: row._avg.rating, reviewCount: row._count.rating }]));
  }
  private ratingFor(ratings: Map<string, { averageRating: number | null; reviewCount: number }>, gymId: string): { averageRating: number | null; reviewCount: number } {
    return ratings.get(gymId) ?? { averageRating: null, reviewCount: 0 };
  }
  private csv(value?: string): string[] {
    return value
      ? [
          ...new Set(
            value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ]
      : [];
  }
  private gymNotFound(): never {
    throw new DomainException(ApiErrorCode.GYM_NOT_FOUND, 'Gym not found', HttpStatus.NOT_FOUND);
  }
}
