import { Module } from '@nestjs/common';
import { BestBatchController } from './best-batch.controller';
import { BestBatchService } from './best-batch.service';

@Module({
  imports: [],
  controllers: [BestBatchController],
  providers: [BestBatchService],
})
export class BestBatchModule {}
