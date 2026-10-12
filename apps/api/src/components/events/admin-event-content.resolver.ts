import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Query, Mutation, Resolver, ID } from '@nestjs/graphql';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import {
  AdminRemoveEventInput,
  AdminSaveEventContentInput,
} from '../../schemas/courses/admin-content.input';
import { AdminEventCatalogObject } from '../../schemas/events/admin-event-catalog.object';
import { AdminEventContentService } from './admin-event-content.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminEventContentResolver {
  constructor(private readonly service: AdminEventContentService) {}
  @Query(() => AdminEventCatalogObject) adminEventCatalog(
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.catalog(input);
  }
  @Mutation(() => ID) adminSaveEventContent(
    @AuthMember('id') actor: string,
    @Args('input') input: AdminSaveEventContentInput,
  ) {
    return this.service.save(actor, input);
  }
}
