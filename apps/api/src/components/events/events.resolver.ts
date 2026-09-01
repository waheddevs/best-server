import { Resolver } from '@nestjs/graphql';
import { EventsService } from './events.service';

@Resolver()
export class EventsResolver {
  constructor(private readonly eventsService: EventsService) {}
}
