import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceResolver } from './finance.resolver';

@Module({
  providers: [FinanceResolver, FinanceService],
})
export class FinanceModule {}
