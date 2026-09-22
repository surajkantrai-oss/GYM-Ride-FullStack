import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { AdminReviewListDto, ModerateReviewDto, ReviewInputDto, ReviewListDto } from './reviews.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Customer Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.CUSTOMER)
@Controller('bookings/:bookingId/review')
export class CustomerReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @ApiOperation({ summary: 'Review a completed booking once; booking ownership and status are server-verified' })
  @ApiResponse({ status: 409, description: 'Booking not completed or already reviewed' })
  create(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() input: ReviewInputDto): Promise<unknown> {
    return this.reviews.create(user.id, bookingId, input);
  }

  @Get()
  @ApiOperation({ summary: 'Read my review for a booking, including its moderation status' })
  get(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string): Promise<unknown> {
    return this.reviews.mine(user.id, bookingId);
  }

  @Patch()
  @ApiOperation({ summary: 'Edit my active review without changing its booking or moderation state' })
  edit(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() input: ReviewInputDto): Promise<unknown> {
    return this.reviews.edit(user.id, bookingId, input);
  }
}

@ApiTags('Public Reviews')
@Controller('gyms/:gymId/reviews')
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated published reviews and server-computed aggregate rating' })
  list(@Param('gymId', ParseUUIDPipe) gymId: string, @Query() query: ReviewListDto): Promise<unknown> {
    return this.reviews.publicList(gymId, query);
  }
}

@ApiTags('Partner Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER)
@Controller('partner/reviews')
export class PartnerReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Read reviews for gyms I manage; read-only' })
  list(@CurrentUser() user: AuthUser, @Query() query: ReviewListDto): Promise<unknown> {
    return this.reviews.partnerList(user, query);
  }

  @Get(':reviewId')
  get(@CurrentUser() user: AuthUser, @Param('reviewId', ParseUUIDPipe) reviewId: string): Promise<unknown> {
    return this.reviews.partnerGet(user, reviewId);
  }
}

@ApiTags('Admin Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter all customer reviews for moderation' })
  list(@Query() query: AdminReviewListDto): Promise<unknown> {
    return this.reviews.adminList(query);
  }

  @Get(':reviewId')
  get(@Param('reviewId', ParseUUIDPipe) reviewId: string): Promise<unknown> {
    return this.reviews.adminGet(reviewId);
  }

  @Patch(':reviewId/moderation')
  @ApiOperation({ summary: 'Publish, hide, or remove a review with a recorded reason and audit log' })
  moderate(@CurrentUser() user: AuthUser, @Param('reviewId', ParseUUIDPipe) reviewId: string, @Body() input: ModerateReviewDto): Promise<unknown> {
    return this.reviews.moderate(user.id, reviewId, input);
  }
}
