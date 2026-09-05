import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsService } from './events.service';
import { EventsResolver } from './events.resolver';

@Module({
  imports: [AuthModule],
  providers: [EventsResolver, EventsService],
})
export class EventsModule {}
