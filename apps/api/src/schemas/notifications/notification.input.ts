import { Field, ID, InputType } from '@nestjs/graphql';
@InputType('CompleteTeacherTaskInput')
export class CompleteTeacherTaskInput {
  @Field(() => ID) taskId!: string;
}
@InputType('MarkNotificationReadInput')
export class MarkNotificationReadInput {
  @Field(() => ID) notificationId!: string;
}
