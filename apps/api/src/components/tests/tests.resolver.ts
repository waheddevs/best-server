import { Resolver } from '@nestjs/graphql';
import { TestsService } from './tests.service';

@Resolver()
export class TestsResolver {
  constructor(private readonly testsService: TestsService) {}
}
