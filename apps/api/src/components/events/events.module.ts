import { AssetsModule } from '../assets/assets.module';
import { EventCoverService } from './event-cover.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsService } from './events.service';
import { EventsResolver } from './events.resolver';

import { AdminEventContentResolver } from './admin-event-content.resolver';
import { AdminEventContentService } from './admin-event-content.service';
import { AdminRequestsResolver } from './admin-requests.resolver';
import { AdminRequestsService } from './admin-requests.service';
@Module({
  imports: [AuthModule, AssetsModule],
  providers: [
    EventCoverService,
    AdminRequestsResolver,
    AdminRequestsService,
    AdminEventContentResolver,
    AdminEventContentService,
    EventsResolver,
    EventsService,
  ],
})
export class EventsModule {}
