import { Module } from '@nestjs/common';
import { ResultsService } from './results.service';
import { ResultsResolver } from './results.resolver';

@Module({
  providers: [ResultsResolver, ResultsService],
})
export class ResultsModule {}
