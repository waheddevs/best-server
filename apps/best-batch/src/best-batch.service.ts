import { Injectable } from '@nestjs/common';

@Injectable()
export class BestBatchService {
  getHello(): string {
    return 'Hello World!';
  }
}
