import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { NotificationsResolver } from './notifications.resolver';
import { DebtNotificationReconcilerService } from './debt-notification-reconciler.service';

@Module({
  imports: [AuthModule],
  providers: [DebtNotificationReconcilerService, NotificationsResolver, NotificationsService],
})
export class NotificationsModule {}
