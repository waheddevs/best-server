import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';

import { TuitionLedgerConnectionObject } from '../../schemas/finance/tuition-ledger.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { FinanceService } from './finance.service';

@Resolver()
export class FinanceResolver {
  constructor(private readonly financeService: FinanceService) {}

  @Query(() => TuitionLedgerConnectionObject, { name: 'studentTuitionLedger' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentTuitionLedger(
    @AuthMember('id') studentId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<TuitionLedgerConnectionObject> {
    return this.financeService.getStudentLedger(studentId, first, after);
  }

  @Query(() => TuitionLedgerConnectionObject, { name: 'adminTuitionLedger' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminTuitionLedger(
    @Args('studentId', { nullable: true, type: () => ID }) studentId?: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<TuitionLedgerConnectionObject> {
    return this.financeService.getAdminLedger(studentId, first, after);
  }
}
