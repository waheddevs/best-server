import {
  ContentStatus,
  MediaMalwareStatus,
  MediaObjectStatus,
  UserRole,
} from '@best/database';
import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  GraphQLISODateTime,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import {
  AdminArchiveLibraryItemInput,
  AdminRejectMediaObjectInput,
} from '../../schemas/audit/admin-operations.input';
import {
  AdminAuditLogConnectionObject,
  AdminLibraryItemConnectionObject,
  AdminLibraryItemPayloadObject,
  AdminMediaObjectConnectionObject,
  AdminMediaObjectPayloadObject,
  AdminOperationalOverviewObject,
} from '../../schemas/audit/admin-operations.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from './audit.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditResolver {
  constructor(private readonly service: AuditService) {}
  @Query(() => AdminOperationalOverviewObject, {
    name: 'adminOperationalOverview',
  })
  overview() {
    return this.service.overview();
  }
  @Query(() => AdminLibraryItemConnectionObject, { name: 'adminLibraryItems' })
  library(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => ContentStatus })
    status?: ContentStatus,
    @Args('ownerId', { nullable: true, type: () => ID }) ownerId?: string,
    @Args('search', { nullable: true }) search?: string,
  ) {
    return this.service.library(first, after, status, ownerId, search);
  }
  @Query(() => AdminMediaObjectConnectionObject, { name: 'adminMediaObjects' })
  media(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => MediaObjectStatus })
    status?: MediaObjectStatus,
    @Args('malwareStatus', { nullable: true, type: () => MediaMalwareStatus })
    malwareStatus?: MediaMalwareStatus,
    @Args('ownerId', { nullable: true, type: () => ID }) ownerId?: string,
  ) {
    return this.service.media(first, after, status, malwareStatus, ownerId);
  }
  @Query(() => AdminAuditLogConnectionObject, { name: 'adminAuditLogs' }) logs(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('actorId', { nullable: true, type: () => ID }) actorId?: string,
    @Args('action', { nullable: true }) action?: string,
    @Args('targetType', { nullable: true }) targetType?: string,
    @Args('from', { nullable: true, type: () => GraphQLISODateTime })
    from?: Date,
    @Args('to', { nullable: true, type: () => GraphQLISODateTime }) to?: Date,
  ) {
    return this.service.logs(
      first,
      after,
      actorId,
      action,
      targetType,
      from,
      to,
    );
  }
  @Mutation(() => AdminLibraryItemPayloadObject, {
    name: 'adminSetLibraryItemArchived',
  })
  async archive(
    @AuthMember('id') id: string,
    @Args('input') input: AdminArchiveLibraryItemInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      item: await this.service.archiveLibrary(
        id,
        input.libraryItemId,
        input.archived,
        input.reason,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => AdminMediaObjectPayloadObject, {
    name: 'adminRejectMediaObject',
  })
  async reject(
    @AuthMember('id') id: string,
    @Args('input') input: AdminRejectMediaObjectInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      mediaObject: await this.service.rejectMedia(
        id,
        input.mediaObjectId,
        input.reason,
        ctx.req.requestId,
      ),
    };
  }
}
