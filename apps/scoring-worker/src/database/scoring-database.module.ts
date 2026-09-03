import { Global, Module } from '@nestjs/common';

import { ScoringDatabaseService } from './scoring-database.service';

@Global()
@Module({
  exports: [ScoringDatabaseService],
  providers: [ScoringDatabaseService],
})
export class ScoringDatabaseModule {}
