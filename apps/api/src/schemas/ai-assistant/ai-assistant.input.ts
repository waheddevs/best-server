import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class CreateTeacherAiConversationInput {
  @Field(() => ID) id!: string;
  @Field() noticeVersion!: string;
  @Field() consent!: boolean;
}

@InputType()
export class SendTeacherAiMessageInput {
  @Field(() => ID) conversationId!: string;
  @Field() text!: string;
  @Field(() => ID) idempotencyKey!: string;
}

@InputType()
export class RetryTeacherAiChatRunInput {
  @Field(() => ID) runId!: string;
  @Field(() => ID) idempotencyKey!: string;
}

@InputType()
export class RenameTeacherAiConversationInput {
  @Field(() => ID) conversationId!: string;
  @Field() title!: string;
}
