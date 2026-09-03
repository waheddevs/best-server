import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { SCORE_ATTEMPT_JOB, TEST_SCORING_QUEUE } from './scoring.constants';
import { parseScoreAttemptJobData } from './scoring-job.type';
import { ScoringService } from './scoring.service';

@Processor(TEST_SCORING_QUEUE, { concurrency: 4 })
export class ScoringProcessor extends WorkerHost {
  constructor(private readonly scoringService: ScoringService) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== SCORE_ATTEMPT_JOB) {
      throw new Error(`Unsupported scoring job name: ${job.name}`);
    }

    const data = parseScoreAttemptJobData(job.data);
    await this.scoringService.scoreAttempt(data.attemptId, data.correlationId);
  }
}
