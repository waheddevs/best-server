import { Resolver } from '@nestjs/graphql';
import { LessonsService } from './lessons.service';

@Resolver()
export class LessonsResolver {
  constructor(private readonly lessonsService: LessonsService) {}
}
