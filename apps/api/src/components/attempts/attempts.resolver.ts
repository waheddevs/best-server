import { Language, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import {
  SaveAttemptAnswerPayloadObject,
  StartTestAttemptPayloadObject,
  SubmitTestAttemptPayloadObject,
} from '../../schemas/attempts/attempt-mutation-payload.object';
import { SaveAttemptAnswerInput } from '../../schemas/attempts/save-attempt-answer.input';
import { StartTestAttemptInput } from '../../schemas/attempts/start-test-attempt.input';
import { StudentAttemptObject } from '../../schemas/attempts/student-attempt.object';
import { StudentReleasedAttemptResultObject } from '../../schemas/attempts/student-released-attempt-result.object';
import { SubmitTestAttemptInput } from '../../schemas/attempts/submit-test-attempt.input';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { AttemptsService } from './attempts.service';

@Resolver()
export class AttemptsResolver {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Query(() => StudentReleasedAttemptResultObject, {
    name: 'studentReleasedAttemptResult',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentReleasedAttemptResult(
    @AuthMember('id') studentId: string,
    @Args('attemptId', { type: () => ID }) attemptId: string,
  ): Promise<StudentReleasedAttemptResultObject> {
    return this.attemptsService.getStudentReleasedAttemptResult(
      studentId,
      attemptId,
    );
  }

  @Query(() => StudentAttemptObject, { name: 'studentAttempt' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentAttempt(
    @AuthMember('id') studentId: string,
    @Args('attemptId', { type: () => ID }) attemptId: string,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<StudentAttemptObject> {
    return this.attemptsService.getStudentAttempt(
      studentId,
      attemptId,
      language,
    );
  }

  @Mutation(() => StartTestAttemptPayloadObject, {
    name: 'startTestAttempt',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async startTestAttempt(
    @AuthMember('id') studentId: string,
    @Args('input') input: StartTestAttemptInput,
  ): Promise<StartTestAttemptPayloadObject> {
    return {
      attempt: await this.attemptsService.startTestAttempt(studentId, input),
    };
  }

  @Mutation(() => SaveAttemptAnswerPayloadObject, {
    name: 'saveAttemptAnswer',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async saveAttemptAnswer(
    @AuthMember('id') studentId: string,
    @Args('input') input: SaveAttemptAnswerInput,
    @Args('language', { type: () => Language }) language: Language,
    @Context() context: ApiGraphqlContext,
  ): Promise<SaveAttemptAnswerPayloadObject> {
    return {
      attempt: await this.attemptsService.saveAttemptAnswer(
        studentId,
        input,
        context.req.requestId,
        language,
      ),
    };
  }

  @Mutation(() => SubmitTestAttemptPayloadObject, {
    name: 'submitTestAttempt',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async submitTestAttempt(
    @AuthMember('id') studentId: string,
    @Args('input') input: SubmitTestAttemptInput,
    @Args('language', { type: () => Language }) language: Language,
    @Context() context: ApiGraphqlContext,
  ): Promise<SubmitTestAttemptPayloadObject> {
    return {
      attempt: await this.attemptsService.submitTestAttempt(
        studentId,
        input,
        context.req.requestId,
        language,
      ),
    };
  }
}
