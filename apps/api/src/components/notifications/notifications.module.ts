import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { NotificationsResolver } from './notifications.resolver';

@Module({
  imports: [AuthModule],
  providers: [NotificationsResolver, NotificationsService],
})
export class NotificationsModule {}
