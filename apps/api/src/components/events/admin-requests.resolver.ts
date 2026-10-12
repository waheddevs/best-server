import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Query, Mutation, Resolver, ID } from '@nestjs/graphql';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import { Language } from '@best/database';
import { AdminRequestDirectoryObject } from '../../schemas/events/admin-request.object';
import {
  AdminReviewRequestInput,
  AdminRemoveRequestInput,
} from '../../schemas/events/admin-request.input';
import { AdminRequestsService } from './admin-requests.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminRequestsResolver {
  constructor(private readonly service: AdminRequestsService) {}
  @Query(() => AdminRequestDirectoryObject) adminRequestDirectory(
    @Args('input') input: AdminDirectoryInput,
    @Args('language', { type: () => Language }) language: Language,
  ) {
    return this.service.directory(input, language);
  }
  @Mutation(() => ID) adminRemoveRequest(
    @AuthMember('id') actor: string,
    @Args('input') input: AdminRemoveRequestInput,
  ) {
    return this.service.remove(actor, input);
  }
  @Mutation(() => ID) adminReviewRequest(
    @AuthMember('id') actor: string,
    @Args('input') input: AdminReviewRequestInput,
  ) {
    return this.service.review(actor, input);
  }
}
