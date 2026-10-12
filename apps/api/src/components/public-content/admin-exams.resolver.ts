import { UserRole, Language } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Query, Mutation, Resolver, ID } from '@nestjs/graphql';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import {
  AdminExamCatalogObject,
  AdminExamSessionDirectoryObject,
} from '../../schemas/public-content/admin-exam.object';
import {
  AdminRemoveExamInput,
  AdminSaveExamInput,
  AdminSaveExamSessionInput,
} from '../../schemas/public-content/admin-exam.input';
import { AdminExamsService } from './admin-exams.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminExamsResolver {
  constructor(private readonly service: AdminExamsService) {}
  @Query(() => AdminExamCatalogObject) adminExamCatalog(
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.catalog(input);
  }
  @Query(() => AdminExamSessionDirectoryObject) adminExamSessionDirectory(
    @Args('input') input: AdminDirectoryInput,
    @Args('language', { type: () => Language }) language: Language,
  ) {
    return this.service.sessions(input, language);
  }
  @Mutation(() => ID) adminSaveExam(
    @AuthMember('id') actor: string,
    @Args('input') input: AdminSaveExamInput,
  ) {
    return this.service.save(actor, input);
  }
  @Mutation(() => ID) adminSaveExamSession(
    @AuthMember('id') actor: string,
    @Args('input') input: AdminSaveExamSessionInput,
  ) {
    return this.service.saveSession(actor, input);
  }
}
