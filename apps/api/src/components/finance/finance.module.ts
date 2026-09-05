import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceService } from './finance.service';
import { FinanceResolver } from './finance.resolver';

@Module({
  imports: [AuthModule],
  providers: [FinanceResolver, FinanceService],
})
export class FinanceModule {}
