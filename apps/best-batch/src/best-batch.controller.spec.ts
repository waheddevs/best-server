import { Test, TestingModule } from '@nestjs/testing';
import { BestBatchController } from './best-batch.controller';
import { BestBatchService } from './best-batch.service';

describe('BestBatchController', () => {
  let bestBatchController: BestBatchController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [BestBatchController],
      providers: [BestBatchService],
    }).compile();

    bestBatchController = app.get<BestBatchController>(BestBatchController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(bestBatchController.getHello()).toBe('Hello World!');
    });
  });
});
