import { loadInfrastructureEnvironment } from '@best/config';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ScoringDatabaseModule } from './database/scoring-database.module';
import { ExpiredAttemptSubmitterService } from './outbox/expired-attempt-submitter.service';
import { ScoringOutboxRelayService } from './outbox/scoring-outbox-relay.service';
import { TEST_SCORING_QUEUE } from './scoring/scoring.constants';
import { ScoringProcessor } from './scoring/scoring.processor';
import { ScoringService } from './scoring/scoring.service';

@Module({
  imports: [
    ScoringDatabaseModule,
    BullModule.forRootAsync({
      useFactory: () => {
        const environment = loadInfrastructureEnvironment();

        return {
          connection: {
            host: environment.redis.host,
            port: environment.redis.port,
          },
          prefix: 'best',
        };
      },
    }),
    BullModule.registerQueue({ name: TEST_SCORING_QUEUE }),
  ],
  providers: [
    ExpiredAttemptSubmitterService,
    ScoringOutboxRelayService,
    ScoringProcessor,
    ScoringService,
  ],
})
export class ScoringWorkerModule {}
