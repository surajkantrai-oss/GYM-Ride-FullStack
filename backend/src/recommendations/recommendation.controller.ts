import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser } from '../common/types/auth-user';
import { RecommendationQueryDto, UpdateGymPreferenceDto } from './recommendation.dto';
import { RecommendationService } from './recommendation.service';

@ApiTags('Recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RecommendationController {
  constructor(private readonly recommendations: RecommendationService) {}
  @Get('recommendations/gyms')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Deterministically rank eligible gyms for the authenticated customer', description: 'Applies hard filters before a transparent 0–100 weighted score. This endpoint does not use AI.' })
  @ApiOkResponse({ description: 'Paginated eligible branches ranked from 0–100 with structured reason codes', schema: { example: { data: [{ gym: { id: 'uuid', name: 'Example Gym' }, branch: { id: 'uuid', name: 'Central', city: 'Pune' }, distanceMeters: 850, averageRating: 4.6, reviewCount: 42, startingPriceMinor: 49900, currency: 'INR', planTypes: ['DAY_PASS'], amenities: ['Parking'], flexEligible: true, availability: { availableSlots: 3, openAtDesiredTime: true }, score: 87, reasons: ['NEAR_YOU', 'HIGHLY_RATED', 'FLEX_ELIGIBLE'] }], meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false }, context: { personalized: true, locationUsed: true, city: null, radiusKm: 10 } } } })
  @ApiBadRequestResponse({ description: 'Invalid coordinates, radius, budget, or recommendation context' })
  gyms(@CurrentUser() user: AuthUser, @Query() query: RecommendationQueryDto): Promise<unknown> { return this.recommendations.recommend(user.id, query); }
  @Get('users/me/gym-preferences')
  @ApiOperation({ summary: 'Read the authenticated customer gym preferences' })
  @ApiOkResponse({ description: 'Owned, optional non-sensitive gym preference record' })
  preference(@CurrentUser() user: AuthUser): Promise<unknown> { return this.recommendations.preference(user.id); }
  @Patch('users/me/gym-preferences')
  @ApiOperation({ summary: 'Update the authenticated customer gym preferences' })
  @ApiOkResponse({ description: 'Validated preference record for the authenticated customer' })
  @ApiBadRequestResponse({ description: 'Unknown amenity, invalid radius/hour, or inverted budget range' })
  updatePreference(@CurrentUser() user: AuthUser, @Body() dto: UpdateGymPreferenceDto): Promise<unknown> { return this.recommendations.updatePreference(user.id, dto); }
}
