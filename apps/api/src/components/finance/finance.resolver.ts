import { Resolver } from '@nestjs/graphql';
import { FinanceService } from './finance.service';

@Resolver()
export class FinanceResolver {
  constructor(private readonly financeService: FinanceService) {}
}
