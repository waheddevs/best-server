import { TeacherTaskKind, TeacherTaskStatus } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { PageInfoObject } from '../pagination/page-info.object';
@ObjectType('TeacherDashboard')
export class TeacherDashboardObject {
  @Field(() => Int) activeGroupCount!: number;
  @Field(() => Int) activeStudentCount!: number;
  @Field(() => Int) lessonsToday!: number;
  @Field(() => Int) openTaskCount!: number;
  @Field(() => Int) pendingSubmissionCount!: number;
  @Field(() => Int) unreadNotificationCount!: number;
}
@ObjectType('TeacherTask')
export class TeacherTaskObject {
  @Field(() => ID) id!: string;
  @Field(() => ID, { nullable: true }) groupId!: string | null;
  @Field(() => TeacherTaskKind) kind!: TeacherTaskKind;
  @Field(() => TeacherTaskStatus) status!: TeacherTaskStatus;
  @Field(() => String) title!: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) dueAt!: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  completedAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}
@ObjectType('TeacherTaskEdge')
export class TeacherTaskEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => TeacherTaskObject) node!: TeacherTaskObject;
}
@ObjectType('TeacherTaskConnection')
export class TeacherTaskConnectionObject {
  @Field(() => [TeacherTaskEdgeObject]) edges!: TeacherTaskEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('TeacherTaskPayload')
export class TeacherTaskPayloadObject {
  @Field(() => TeacherTaskObject) task!: TeacherTaskObject;
}
@ObjectType('Notification')
export class NotificationObject {
  @Field(() => ID) id!: string;
  @Field(() => String) kind!: string;
  @Field(() => String) title!: string;
  @Field(() => String, { nullable: true }) body!: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) readAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}
@ObjectType('NotificationEdge')
export class NotificationEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => NotificationObject) node!: NotificationObject;
}
@ObjectType('NotificationConnection')
export class NotificationConnectionObject {
  @Field(() => [NotificationEdgeObject]) edges!: NotificationEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('NotificationPayload')
export class NotificationPayloadObject {
  @Field(() => NotificationObject) notification!: NotificationObject;
}
@ObjectType('MarkAllNotificationsReadPayload')
export class MarkAllNotificationsReadPayloadObject {
  @Field(() => Int) updatedCount!: number;
}
