import { NestFactory } from '@nestjs/core';

import { ImportWorkerModule } from './import-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ImportWorkerModule);

  app.enableShutdownHooks();
}

void bootstrap();
