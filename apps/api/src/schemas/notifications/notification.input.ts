import { TeacherTaskKind } from '@best/database';
import { Field, GraphQLISODateTime, ID, InputType } from '@nestjs/graphql';
@InputType('AdminAssignTeacherTaskInput')
export class AdminAssignTeacherTaskInput {
  @Field(() => ID) teacherId!: string;
  @Field(() => ID) requestId!: string;
  @Field() title!: string;
  @Field(() => TeacherTaskKind) kind!: TeacherTaskKind;
  @Field(() => ID, { nullable: true }) groupId?: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) dueAt?: Date | null;
}
@InputType('CompleteTeacherTaskInput')
export class CompleteTeacherTaskInput {
  @Field(() => ID) taskId!: string;
}
@InputType('MarkNotificationReadInput')
export class MarkNotificationReadInput {
  @Field(() => ID) notificationId!: string;
}
