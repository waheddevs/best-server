import { AiChatRunStatus, AiMessageKind } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

registerEnumType(AiChatRunStatus, { name: 'AiChatRunStatus' });
registerEnumType(AiMessageKind, { name: 'AiMessageKind' });

@ObjectType('TeacherAiAvailability')
export class TeacherAiAvailabilityObject {
  @Field() available!: boolean;
  @Field(() => Int) maxInputCharacters!: number;
  @Field(() => Int) retentionDays!: number;
  @Field(() => String, { nullable: true }) noticeVersion!: string | null;
  @Field(() => String, { nullable: true }) model!: string | null;
}

@ObjectType('TeacherAiMessage')
export class TeacherAiMessageObject {
  @Field(() => ID) id!: string;
  @Field(() => Int) sequence!: number;
  @Field(() => AiMessageKind) kind!: AiMessageKind;
  @Field() content!: string;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType('TeacherAiChatRun')
export class TeacherAiChatRunObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) conversationId!: string;
  @Field(() => AiChatRunStatus) status!: AiChatRunStatus;
  @Field(() => String, { nullable: true }) safeErrorCode!: string | null;
  @Field() retryable!: boolean;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true })
  completedAt!: Date | null;
}

@ObjectType('TeacherAiConversationSummary')
export class TeacherAiConversationSummaryObject {
  @Field(() => ID) id!: string;
  @Field() title!: string;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => GraphQLISODateTime) expiresAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) archivedAt!: Date | null;
}

@ObjectType('TeacherAiConversation')
export class TeacherAiConversationObject extends TeacherAiConversationSummaryObject {
  @Field(() => [TeacherAiMessageObject]) messages!: TeacherAiMessageObject[];
  @Field(() => TeacherAiChatRunObject, { nullable: true })
  latestRun!: TeacherAiChatRunObject | null;
  @Field() hasOlder!: boolean;
  @Field(() => String, { nullable: true }) olderCursor!: string | null;
}

@ObjectType('TeacherAiConversationPage')
export class TeacherAiConversationPageObject {
  @Field(() => [TeacherAiConversationSummaryObject])
  items!: TeacherAiConversationSummaryObject[];
  @Field() hasMore!: boolean;
  @Field(() => String, { nullable: true }) cursor!: string | null;
}
