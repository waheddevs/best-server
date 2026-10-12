import { AdminFinanceService } from './admin-finance.service';
import { AdminFinanceResolver } from './admin-finance.resolver';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceService } from './finance.service';
import { FinanceResolver } from './finance.resolver';

@Module({
  imports: [AuthModule],
  providers: [
    AdminFinanceService,
    AdminFinanceResolver,
    FinanceResolver,
    FinanceService,
  ],
})
export class FinanceModule {}
