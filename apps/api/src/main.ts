import { loadApiEnvironment } from '@best/config';
import { createApplicationLogger } from '@best/logger';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const environment = loadApiEnvironment();
  const logger = createApplicationLogger({
    format: environment.nodeEnvironment === 'development' ? 'pretty' : 'json',
    service: 'best-api',
  });
  const app = await NestFactory.create(AppModule, { logger });

  app.enableShutdownHooks();
  await app.listen(environment.apiPort);
}

void bootstrap();
