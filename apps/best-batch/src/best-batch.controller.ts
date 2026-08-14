import { Controller, Get } from '@nestjs/common';
import { BestBatchService } from './best-batch.service';

@Controller()
export class BestBatchController {
  constructor(private readonly bestBatchService: BestBatchService) {}

  @Get()
  getHello(): string {
    return this.bestBatchService.getHello();
  }
}
