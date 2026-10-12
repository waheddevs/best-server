import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { NotificationsResolver } from './notifications.resolver';
import { DebtNotificationReconcilerService } from './debt-notification-reconciler.service';

import { AdminNoticesResolver } from './admin-notices.resolver';
import { AdminNoticesService } from './admin-notices.service';
@Module({
  imports: [AuthModule],
  providers: [
    AdminNoticesResolver,
    AdminNoticesService,
    DebtNotificationReconcilerService,
    NotificationsResolver,
    NotificationsService,
  ],
})
export class NotificationsModule {}
