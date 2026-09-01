import { Resolver } from '@nestjs/graphql';
import { ResultsService } from './results.service';

@Resolver()
export class ResultsResolver {
  constructor(private readonly resultsService: ResultsService) {}
}
