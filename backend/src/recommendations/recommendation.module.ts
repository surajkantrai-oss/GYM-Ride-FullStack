import { Module } from '@nestjs/common';
import { RecommendationCandidateService } from './recommendation-candidate.service';
import { RecommendationController } from './recommendation.controller';
import { RecommendationPolicy } from './recommendation.policy';
import { RecommendationService } from './recommendation.service';

@Module({ controllers: [RecommendationController], providers: [RecommendationService, RecommendationCandidateService, RecommendationPolicy] })
export class RecommendationModule {}
