import {
  AdminSalaryReport,
  AdminSalaryHistory,
} from '../../schemas/finance/admin-salary-report.object';
import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';

import {
  AdminPaymentDirectory,
  AdminPaymentRow,
  AdminSalaryDirectory,
  AdminSalaryRow,
} from '../../schemas/finance/admin-finance.object';
import { AdminSaveSalaryInput } from '../../schemas/finance/admin-salary.input';
import { AdminFinanceService } from './admin-finance.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminFinanceResolver {
  constructor(private readonly service: AdminFinanceService) {}
  @Query(() => AdminSalaryReport) adminSalaryReport(
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.salaryReport(input);
  }
  @Query(() => AdminSalaryHistory) adminSalaryHistory(
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.salaryHistory(input);
  }
  @Query(() => AdminPaymentDirectory) adminPaymentDirectory(
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.payments(input);
  }
  @Query(() => AdminPaymentRow) adminPaymentDetail(
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.payment(id);
  }
  @Query(() => AdminSalaryDirectory) adminSalaryDirectory(
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.salaries(input);
  }
  @Mutation(() => AdminSalaryRow) adminSaveSalary(
    @AuthMember('id') id: string,
    @Args('input') input: AdminSaveSalaryInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return this.service.saveSalary(id, input, ctx.req.requestId);
  }
  @Mutation(() => AdminSalaryRow) adminFinalizeSalary(
    @AuthMember('id') actor: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('version', { type: () => Int }) version: number,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return this.service.finalize(actor, id, version, ctx.req.requestId);
  }
}
