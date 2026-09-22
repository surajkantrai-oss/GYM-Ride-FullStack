import { Module } from '@nestjs/common';
import { GymAccessModule } from '../gym-access/gym-access.module';
import { AdminReviewsController, CustomerReviewsController, PartnerReviewsController, PublicReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [GymAccessModule],
  controllers: [CustomerReviewsController, PublicReviewsController, PartnerReviewsController, AdminReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
