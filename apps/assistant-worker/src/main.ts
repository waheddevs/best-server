import { loadWorkerEnvironment, parseTeacherAiEnvironment } from '@best/config';
import { createApplicationLogger } from '@best/logger';
import { NestFactory } from '@nestjs/core';
import { AssistantWorkerModule } from './assistant-worker.module';

async function bootstrap(): Promise<void> {
  const environment = loadWorkerEnvironment();
  parseTeacherAiEnvironment(process.env);
  const logger = createApplicationLogger({
    format: environment.nodeEnvironment === 'development' ? 'pretty' : 'json',
    service: 'best-assistant-worker',
  });
  const app = await NestFactory.createApplicationContext(
    AssistantWorkerModule,
    { logger },
  );
  app.enableShutdownHooks();
}
void bootstrap();
