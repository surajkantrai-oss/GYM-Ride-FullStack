import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecommendationQueryDto, UpdateGymPreferenceDto } from './recommendation.dto';

describe('Recommendation DTO security boundaries', () => {
  it('rejects invalid coordinates', async () => expect(await validate(plainToInstance(RecommendationQueryDto, { latitude: '100', longitude: '200' }))).not.toHaveLength(0));
  it('rejects abusive radius values', async () => expect(await validate(plainToInstance(RecommendationQueryDto, { radiusKm: 500 }))).not.toHaveLength(0));
  it('normalizes and bounds amenity filters', async () => { const dto = plainToInstance(RecommendationQueryDto, { amenities: 'Parking, showers,parking' }); expect(await validate(dto)).toHaveLength(0); expect(dto.amenities).toEqual(['parking', 'showers']); });
  it('rejects invalid preference hours and radii', async () => expect(await validate(plainToInstance(UpdateGymPreferenceDto, { preferredWorkoutHour: 24, preferredRadiusKm: 0 }))).not.toHaveLength(0));
});
