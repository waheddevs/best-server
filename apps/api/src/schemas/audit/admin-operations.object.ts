import {
  ContentStatus,
  MediaMalwareStatus,
  MediaObjectStatus,
} from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { PageInfoObject } from '../pagination/page-info.object';
@ObjectType('AdminOperationalOverview')
export class AdminOperationalOverviewObject {
  @Field(() => Int) activeUsers!: number;
  @Field(() => Int) activeGroups!: number;
  @Field(() => Int) pendingIntakes!: number;
  @Field(() => Int) pendingMedia!: number;
  @Field(() => Int) unreadNotifications!: number;
}
@ObjectType('AdminLibraryItem')
export class AdminLibraryItemObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) ownerId!: string;
  @Field(() => String) ownerName!: string;
  @Field(() => ContentStatus) status!: ContentStatus;
  @Field(() => String) title!: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) archivedAt!: Date | null;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}
@ObjectType('AdminLibraryItemEdge')
export class AdminLibraryItemEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => AdminLibraryItemObject) node!: AdminLibraryItemObject;
}
@ObjectType('AdminLibraryItemConnection')
export class AdminLibraryItemConnectionObject {
  @Field(() => [AdminLibraryItemEdgeObject])
  edges!: AdminLibraryItemEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('AdminLibraryItemPayload')
export class AdminLibraryItemPayloadObject {
  @Field(() => AdminLibraryItemObject) item!: AdminLibraryItemObject;
}
@ObjectType('AdminMediaObject')
export class AdminMediaObjectObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) ownerId!: string;
  @Field(() => String) originalName!: string;
  @Field(() => String) mimeType!: string;
  @Field(() => MediaObjectStatus) status!: MediaObjectStatus;
  @Field(() => MediaMalwareStatus) malwareStatus!: MediaMalwareStatus;
  @Field(() => String, { nullable: true }) rejectionCode!: string | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}
@ObjectType('AdminMediaObjectEdge')
export class AdminMediaObjectEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => AdminMediaObjectObject) node!: AdminMediaObjectObject;
}
@ObjectType('AdminMediaObjectConnection')
export class AdminMediaObjectConnectionObject {
  @Field(() => [AdminMediaObjectEdgeObject])
  edges!: AdminMediaObjectEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('AdminMediaObjectPayload')
export class AdminMediaObjectPayloadObject {
  @Field(() => AdminMediaObjectObject) mediaObject!: AdminMediaObjectObject;
}
@ObjectType('AdminAuditLog')
export class AdminAuditLogObject {
  @Field(() => ID) id!: string;
  @Field(() => ID, { nullable: true }) actorId!: string | null;
  @Field(() => String) action!: string;
  @Field(() => String) targetType!: string;
  @Field(() => String) targetId!: string;
  @Field(() => String, { nullable: true }) correlationId!: string | null;
  @Field(() => String, { nullable: true }) reason!: string | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}
@ObjectType('AdminAuditLogEdge')
export class AdminAuditLogEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => AdminAuditLogObject) node!: AdminAuditLogObject;
}
@ObjectType('AdminAuditLogConnection')
export class AdminAuditLogConnectionObject {
  @Field(() => [AdminAuditLogEdgeObject]) edges!: AdminAuditLogEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
