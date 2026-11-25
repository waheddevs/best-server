import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateTeacherAiConversationInput,
  RenameTeacherAiConversationInput,
  RetryTeacherAiChatRunInput,
  SendTeacherAiMessageInput,
} from '../../schemas/ai-assistant/ai-assistant.input';
import {
  TeacherAiAvailabilityObject,
  TeacherAiChatRunObject,
  TeacherAiConversationObject,
  TeacherAiConversationPageObject,
  TeacherAiConversationSummaryObject,
} from '../../schemas/ai-assistant/ai-assistant.object';
import { AiAssistantService } from './ai-assistant.service';

@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.TEACHER)
export class AiAssistantResolver {
  constructor(private readonly service: AiAssistantService) {}

  @Query(() => TeacherAiAvailabilityObject)
  teacherAiAvailability(@AuthMember('id') actorId: string) {
    return this.service.execute((store) => store.availability(actorId));
  }

  @Query(() => TeacherAiConversationPageObject)
  teacherAiConversations(
    @AuthMember('id') actorId: string,
    @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
    @Args('archived', { type: () => Boolean, defaultValue: false })
    archived?: boolean,
  ) {
    return this.service.execute((store) =>
      store.list(actorId, first, after, archived),
    );
  }

  @Query(() => TeacherAiConversationObject)
  teacherAiConversation(
    @AuthMember('id') actorId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('first', { type: () => Int, defaultValue: 30 }) first: number,
    @Args('before', { type: () => String, nullable: true }) before?: string,
  ) {
    return this.service.execute((store) =>
      store.detail(actorId, id, first, before),
    );
  }

  @Query(() => TeacherAiChatRunObject)
  teacherAiChatRun(
    @AuthMember('id') actorId: string,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.execute((store) => store.run(actorId, id));
  }

  @Mutation(() => TeacherAiConversationSummaryObject)
  createTeacherAiConversation(
    @AuthMember('id') actorId: string,
    @Args('input') input: CreateTeacherAiConversationInput,
  ) {
    return this.service.execute((store) =>
      store.create(actorId, input.id, input.noticeVersion, input.consent),
    );
  }

  @Mutation(() => TeacherAiChatRunObject)
  sendTeacherAiMessage(
    @AuthMember('id') actorId: string,
    @Args('input') input: SendTeacherAiMessageInput,
  ) {
    return this.service.execute((store) =>
      store.send(
        actorId,
        input.conversationId,
        input.text,
        input.idempotencyKey,
      ),
    );
  }

  @Mutation(() => TeacherAiChatRunObject)
  retryTeacherAiChatRun(
    @AuthMember('id') actorId: string,
    @Args('input') input: RetryTeacherAiChatRunInput,
  ) {
    return this.service.execute((store) =>
      store.retry(actorId, input.runId, input.idempotencyKey),
    );
  }

  @Mutation(() => TeacherAiChatRunObject)
  cancelTeacherAiChatRun(
    @AuthMember('id') actorId: string,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.execute((store) => store.cancel(actorId, id));
  }

  @Mutation(() => TeacherAiConversationSummaryObject)
  renameTeacherAiConversation(
    @AuthMember('id') actorId: string,
    @Args('input') input: RenameTeacherAiConversationInput,
  ) {
    return this.service.execute((store) =>
      store.rename(actorId, input.conversationId, input.title),
    );
  }

  @Mutation(() => TeacherAiConversationSummaryObject)
  archiveTeacherAiConversation(
    @AuthMember('id') actorId: string,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.execute((store) => store.archive(actorId, id));
  }
}
