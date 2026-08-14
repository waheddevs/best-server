import { NestFactory } from '@nestjs/core';
import { BestBatchModule } from './best-batch.module';

async function bootstrap() {
  const app = await NestFactory.create(BestBatchModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
