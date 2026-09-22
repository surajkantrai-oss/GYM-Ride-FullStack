import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, NotificationCategory, NotificationType, Prisma, ReviewStatus } from '@prisma/client';
import { ApiErrorCode as E } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { pageMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { createNotificationIntent } from '../notifications/notification-intent';
import { AdminReviewListDto, ModerateReviewDto, ReviewInputDto, ReviewListDto } from './reviews.dto';

const publicSelect = {
  id: true,
  gymId: true,
  branchId: true,
  rating: true,
  title: true,
  comment: true,
  createdAt: true,
  editedAt: true,
  customer: { select: { firstName: true } },
} satisfies Prisma.ReviewSelect;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
  ) {}

  async create(customerId: string, bookingId: string, input: ReviewInputDto): Promise<unknown> {
    this.assertRating(input.rating);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
        const booking = await tx.booking.findFirst({
          where: { id: bookingId, userId: customerId },
          select: { id: true, status: true, gymId: true, branchId: true },
        });
        if (!booking) this.fail(E.BOOKING_NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
        if (booking.status !== BookingStatus.COMPLETED)
          this.fail(E.BOOKING_NOT_ELIGIBLE_FOR_REVIEW, 'Only completed bookings can be reviewed');
        const review = await tx.review.create({
          data: {
            bookingId,
            customerId,
            gymId: booking.gymId,
            branchId: booking.branchId,
            rating: input.rating,
            title: input.title || null,
            comment: input.comment || null,
          },
        });
        const gym = await tx.gym.findUniqueOrThrow({ where: { id: booking.gymId }, select: { name: true, ownerId: true, memberships: { where: { status: 'ACTIVE', role: 'MANAGER' }, select: { userId: true } } } });
        const recipients = new Set([gym.ownerId, ...gym.memberships.map((member) => member.userId)]);
        for (const userId of recipients)
          await createNotificationIntent(tx, { userId, type: NotificationType.REVIEW_RECEIVED, category: NotificationCategory.REVIEW, title: 'New gym review', body: `A customer reviewed ${gym.name}.`, route: { screen: 'PartnerReviews', gymId: booking.gymId }, dedupeKey: `review:${review.id}:${userId}` });
        return review;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        this.fail(E.REVIEW_ALREADY_EXISTS, 'Booking already has a review');
      throw error;
    }
  }

  async mine(customerId: string, bookingId: string): Promise<unknown> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId: customerId },
      select: { id: true },
    });
    if (!booking) this.fail(E.BOOKING_NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
    const review = await this.prisma.review.findUnique({ where: { bookingId } });
    if (!review) this.fail(E.REVIEW_NOT_FOUND, 'Review not found', HttpStatus.NOT_FOUND);
    return review;
  }

  async edit(customerId: string, bookingId: string, input: ReviewInputDto): Promise<unknown> {
    this.assertRating(input.rating);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM reviews WHERE booking_id = ${bookingId}::uuid FOR UPDATE`;
      const review = await tx.review.findFirst({
        where: { bookingId, customerId },
        select: { id: true, status: true },
      });
      if (!review) this.fail(E.REVIEW_NOT_FOUND, 'Review not found', HttpStatus.NOT_FOUND);
      if (review.status === ReviewStatus.REMOVED)
        this.fail(E.REVIEW_NOT_ALLOWED, 'Removed reviews cannot be edited');
      return tx.review.update({
        where: { id: review.id },
        data: {
          rating: input.rating,
          title: input.title || null,
          comment: input.comment || null,
          editedAt: new Date(),
        },
      });
    });
  }

  async publicList(gymId: string, query: ReviewListDto): Promise<unknown> {
    const gym = await this.prisma.gym.findFirst({
      where: { id: gymId, status: 'APPROVED' },
      select: { id: true },
    });
    if (!gym) this.fail(E.GYM_NOT_FOUND, 'Gym not found', HttpStatus.NOT_FOUND);
    if (query.branchId) {
      const branch = await this.prisma.gymBranch.findFirst({
        where: { id: query.branchId, gymId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!branch) this.fail(E.BRANCH_NOT_FOUND, 'Branch not found', HttpStatus.NOT_FOUND);
    }
    const where: Prisma.ReviewWhereInput = {
      gymId,
      status: ReviewStatus.PUBLISHED,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.rating && { rating: query.rating }),
    };
    const [rows, total, stats] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        select: publicSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({ where: { gymId, status: ReviewStatus.PUBLISHED, ...(query.branchId && { branchId: query.branchId }) }, _avg: { rating: true }, _count: { rating: true } }),
    ]);
    return {
      data: rows.map(({ customer, ...row }) => ({
        ...row,
        reviewerName: customer.firstName?.trim() || 'GYMRide member',
      })),
      aggregate: { averageRating: stats._avg.rating, reviewCount: stats._count.rating },
      meta: pageMeta(query.page, query.limit, total),
    };
  }

  async partnerList(user: AuthUser, query: ReviewListDto): Promise<unknown> {
    if (query.gymId) await this.access.assertGymManagement(user, query.gymId);
    const where: Prisma.ReviewWhereInput = {
      ...(query.gymId ? { gymId: query.gymId } : {
        gym: { OR: [
          { ownerId: user.id },
          { memberships: { some: { userId: user.id, status: 'ACTIVE', role: 'MANAGER' } } },
        ] },
      }),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.rating && { rating: query.rating }),
      ...this.dateWhere(query),
    };
    const [data, total, aggregate] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, select: { id: true, bookingId: true, gymId: true, branchId: true, rating: true, title: true, comment: true, status: true, createdAt: true, editedAt: true, customer: { select: { firstName: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({ where: { AND: [where, { status: ReviewStatus.PUBLISHED }] }, _avg: { rating: true }, _count: { rating: true } }),
    ]);
    return { data: data.map(({ customer, ...review }) => ({ ...review, reviewerName: customer.firstName || 'GYMRide member' })), aggregate: { averageRating: aggregate._avg.rating, reviewCount: aggregate._count.rating }, meta: pageMeta(query.page, query.limit, total) };
  }

  async partnerGet(user: AuthUser, reviewId: string): Promise<unknown> {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { id: true, gymId: true, branchId: true, bookingId: true, rating: true, title: true, comment: true, status: true, createdAt: true, editedAt: true } });
    if (!review) this.fail(E.REVIEW_NOT_FOUND, 'Review not found', HttpStatus.NOT_FOUND);
    await this.access.assertGymManagement(user, review.gymId);
    return review;
  }

  async adminList(query: AdminReviewListDto): Promise<unknown> {
    const where: Prisma.ReviewWhereInput = {
      ...(query.gymId && { gymId: query.gymId }),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.rating && { rating: query.rating }),
      ...(query.status && { status: query.status }),
      ...(query.search && { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { comment: { contains: query.search, mode: 'insensitive' } }] }),
      ...this.dateWhere(query),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, include: { gym: { select: { name: true } }, branch: { select: { name: true } }, customer: { select: { firstName: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.review.count({ where }),
    ]);
    return { data, meta: pageMeta(query.page, query.limit, total) };
  }

  async adminGet(reviewId: string): Promise<unknown> {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, include: { gym: { select: { name: true } }, branch: { select: { name: true } }, customer: { select: { firstName: true } } } });
    if (!review) this.fail(E.REVIEW_NOT_FOUND, 'Review not found', HttpStatus.NOT_FOUND);
    return review;
  }

  async moderate(adminId: string, reviewId: string, input: ModerateReviewDto): Promise<unknown> {
    if (!input.reason || input.reason.trim().length < 3)
      this.fail(E.VALIDATION_FAILED, 'Moderation reason must contain at least 3 characters', HttpStatus.BAD_REQUEST);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM reviews WHERE id = ${reviewId}::uuid FOR UPDATE`;
      const review = await tx.review.findUnique({ where: { id: reviewId } });
      if (!review) this.fail(E.REVIEW_NOT_FOUND, 'Review not found', HttpStatus.NOT_FOUND);
      if (review.status === input.status) return review;
      const updated = await tx.review.update({ where: { id: reviewId }, data: { status: input.status, moderatedAt: new Date(), moderatedById: adminId, moderationReason: input.reason } });
      await tx.auditLog.create({ data: { actorUserId: adminId, action: 'REVIEW_MODERATED', entityType: 'Review', entityId: reviewId, metadata: { previousStatus: review.status, newStatus: input.status, reason: input.reason } } });
      return updated;
    });
  }

  private dateWhere(query: ReviewListDto): Prisma.ReviewWhereInput {
    return query.from || query.to ? { createdAt: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) } } : {};
  }

  private assertRating(rating: number): void {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      this.fail(E.INVALID_REVIEW_RATING, 'Rating must be an integer from 1 to 5', HttpStatus.BAD_REQUEST);
  }

  private fail(code: E, message: string, status = HttpStatus.CONFLICT): never {
    throw new DomainException(code, message, status);
  }
}
