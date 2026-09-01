import { Resolver } from '@nestjs/graphql';
import { AttemptsService } from './attempts.service';

@Resolver()
export class AttemptsResolver {
  constructor(private readonly attemptsService: AttemptsService) {}
}
