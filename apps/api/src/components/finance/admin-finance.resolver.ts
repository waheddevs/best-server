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
} from '../../schemas/finance/admin-finance.object';
import { AdminFinanceService } from './admin-finance.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminFinanceResolver {
  constructor(private readonly service: AdminFinanceService) {}
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
}
