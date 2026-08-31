import { NestFactory } from '@nestjs/core';

import { ScoringWorkerModule } from './scoring-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ScoringWorkerModule);

  app.enableShutdownHooks();
}

void bootstrap();
