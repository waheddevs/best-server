import { loadWorkerEnvironment } from '@best/config';
import { createApplicationLogger } from '@best/logger';
import { NestFactory } from '@nestjs/core';

import { ImportWorkerModule } from './import-worker.module';

async function bootstrap(): Promise<void> {
  const environment = loadWorkerEnvironment();
  const logger = createApplicationLogger({
    format: environment.nodeEnvironment === 'development' ? 'pretty' : 'json',
    service: 'best-import-worker',
  });
  const app = await NestFactory.createApplicationContext(ImportWorkerModule, {
    logger,
  });

  app.enableShutdownHooks();
}

void bootstrap();
