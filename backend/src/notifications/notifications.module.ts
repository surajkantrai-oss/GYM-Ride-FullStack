import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationJobsService } from './notification-jobs.service';
import { NotificationProjectionService } from './notification-projection.service';
import { NotificationsService } from './notifications.service';
import { DevelopmentPushProvider } from './providers/development-push.provider';
import { ExpoPushProvider } from './providers/expo-push.provider';
import { PushProvider } from './providers/push-provider';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationProjectionService,
    NotificationDeliveryService,
    NotificationJobsService,
    NotificationsService,
    { provide: PushProvider, inject: [ConfigService], useFactory: (config: ConfigService): PushProvider => config.get<string>('PUSH_PROVIDER') === 'expo' ? new ExpoPushProvider() : new DevelopmentPushProvider() },
  ],
  exports: [NotificationsService, NotificationProjectionService],
})
export class NotificationsModule {}
