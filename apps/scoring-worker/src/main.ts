import { loadWorkerEnvironment } from '@best/config';
import { createApplicationLogger } from '@best/logger';
import { NestFactory } from '@nestjs/core';

import { ScoringWorkerModule } from './scoring-worker.module';

async function bootstrap(): Promise<void> {
  const environment = loadWorkerEnvironment();
  const logger = createApplicationLogger({
    format: environment.nodeEnvironment === 'development' ? 'pretty' : 'json',
    service: 'best-scoring-worker',
  });
  const app = await NestFactory.createApplicationContext(ScoringWorkerModule, {
    logger,
  });

  app.enableShutdownHooks();
}

void bootstrap();
