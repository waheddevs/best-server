import { ContentStatus, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';

import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import { GenerateListeningAudioInput } from '../../schemas/tests/generate-listening-audio.input';
import { GenerateListeningAudioPayloadObject } from '../../schemas/tests/generated-listening-audio.object';
import {
  AttemptGrantConnectionObject,
  TeacherTestConnectionObject,
} from '../../schemas/tests/teacher-test-connection.object';
import {
  CreateNextTestVersionInput,
  CreateTestCategoryInput,
  CreateTestDraftInput,
  CreateTestQuestionInput,
  CreateTestPaperSkillDraftInput,
  CreateTestSectionBlockInput,
  CreateTestSectionInput,
  GrantAdditionalTestAttemptInput,
  ReplaceTestDraftTranslationsInput,
  ReorderTestQuestionsInput,
  ReorderTestSectionBlocksInput,
  ReorderTestSectionsInput,
  SetTestArchivedInput,
  TestVersionIdInput,
  UpdateTestCategoryInput,
  UpdateTestDraftSettingsInput,
  UpdateTestQuestionInput,
  UpdateTestSectionBlockInput,
  UpdateTestSectionInput,
} from '../../schemas/tests/teacher-test.input';
import {
  TeacherTestDraftValidationObject,
  TeacherTestVersionObject,
  TestCategoryObject,
} from '../../schemas/tests/teacher-test.object';
import {
  AttemptGrantPayloadObject,
  TeacherTestPayloadObject,
  TeacherTestVersionPayloadObject,
  TestCategoryPayloadObject,
} from '../../schemas/tests/teacher-test-payload.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { TestsAuthoringService } from './tests-authoring.service';

@Resolver()
export class TestsAuthoringResolver {
  constructor(private readonly authoring: TestsAuthoringService) {}

  @Query(() => [TestCategoryObject], { name: 'teacherTestCategories' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getCategories(
    @AuthMember('id') teacherId: string,
  ): Promise<TestCategoryObject[]> {
    return this.authoring.getCategories(teacherId);
  }

  @Query(() => TeacherTestConnectionObject, { name: 'teacherTests' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTests(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { nullable: true, type: () => ID }) groupId?: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => ContentStatus })
    status?: ContentStatus,
    @Args('search', { nullable: true }) search?: string,
  ): Promise<TeacherTestConnectionObject> {
    return this.authoring.getTests(
      teacherId,
      groupId,
      first,
      after,
      status,
      search,
    );
  }

  @Query(() => TeacherTestVersionObject, { name: 'teacherTestDraft' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getDraft(
    @AuthMember('id') teacherId: string,
    @Args('testId', { type: () => ID }) testId: string,
  ): Promise<TeacherTestVersionObject> {
    return this.authoring.getDraft(teacherId, testId);
  }

  @Query(() => TeacherTestVersionObject, { name: 'teacherTestVersion' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getVersion(
    @AuthMember('id') teacherId: string,
    @Args('testVersionId', { type: () => ID }) testVersionId: string,
  ): Promise<TeacherTestVersionObject> {
    return this.authoring.getVersion(teacherId, testVersionId);
  }

  @Query(() => TeacherTestDraftValidationObject, {
    name: 'validateTeacherTestDraft',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  validateDraft(
    @AuthMember('id') teacherId: string,
    @Args('testVersionId', { type: () => ID }) testVersionId: string,
  ): Promise<TeacherTestDraftValidationObject> {
    return this.authoring.validateDraft(teacherId, testVersionId);
  }

  @Query(() => AttemptGrantConnectionObject, { name: 'teacherAttemptGrants' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getGrants(
    @AuthMember('id') teacherId: string,
    @Args('testId', { type: () => ID }) testId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<AttemptGrantConnectionObject> {
    return this.authoring.getGrants(teacherId, testId, first, after);
  }

  @Mutation(() => TestCategoryPayloadObject, { name: 'createTestCategory' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createCategory(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateTestCategoryInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TestCategoryPayloadObject> {
    return {
      category: await this.authoring.createCategory(
        teacherId,
        input.name,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TestCategoryPayloadObject, { name: 'updateTestCategory' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async updateCategory(
    @AuthMember('id') teacherId: string,
    @Args('input') input: UpdateTestCategoryInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TestCategoryPayloadObject> {
    return {
      category: await this.authoring.updateCategory(
        teacherId,
        input.categoryId,
        input.name,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestPayloadObject, { name: 'createTestDraft' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createDraft(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateTestDraftInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestPayloadObject> {
    return {
      test: await this.authoring.createDraft(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'createTestPaperSkillDraft',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createPaperSkillDraft(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateTestPaperSkillDraftInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.createPaperSkillDraft(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'updateTestDraftSettings',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async updateSettings(
    @AuthMember('id') teacherId: string,
    @Args('input') input: UpdateTestDraftSettingsInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.updateSettings(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'replaceTestDraftTranslations',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async replaceTranslations(
    @AuthMember('id') teacherId: string,
    @Args('input') input: ReplaceTestDraftTranslationsInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.replaceTranslations(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'createTestSection',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createSection(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateTestSectionInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.createSection(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'updateTestSection',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async updateSection(
    @AuthMember('id') teacherId: string,
    @Args('input') input: UpdateTestSectionInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.updateSection(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => GenerateListeningAudioPayloadObject, {
    name: 'generateListeningAudio',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async generateListeningAudio(
    @AuthMember('id') teacherId: string,
    @Args('input') input: GenerateListeningAudioInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<GenerateListeningAudioPayloadObject> {
    return {
      audio: await this.authoring.generateListeningAudio(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'reorderTestSections',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async reorderSections(
    @AuthMember('id') teacherId: string,
    @Args('input') input: ReorderTestSectionsInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.reorderSections(
        teacherId,
        input.testVersionId,
        input.testSectionIds,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'deleteTestDraftSection',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async deleteSection(
    @AuthMember('id') teacherId: string,
    @Args('input') input: TestVersionIdInput,
    @Args('testSectionId', { type: () => ID }) testSectionId: string,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.deleteSection(
        teacherId,
        input.testVersionId,
        testSectionId,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'createTestSectionBlock',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createSectionBlock(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateTestSectionBlockInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.createSectionBlock(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'updateTestSectionBlock',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async updateSectionBlock(
    @AuthMember('id') teacherId: string,
    @Args('input') input: UpdateTestSectionBlockInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.updateSectionBlock(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'reorderTestSectionBlocks',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async reorderSectionBlocks(
    @AuthMember('id') teacherId: string,
    @Args('input') input: ReorderTestSectionBlocksInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.reorderSectionBlocks(
        teacherId,
        input.testSectionId,
        input.testSectionBlockIds,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'deleteTestSectionBlock',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async deleteSectionBlock(
    @AuthMember('id') teacherId: string,
    @Args('testSectionId', { type: () => ID }) testSectionId: string,
    @Args('testSectionBlockId', { type: () => ID })
    testSectionBlockId: string,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.deleteSectionBlock(
        teacherId,
        testSectionId,
        testSectionBlockId,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'createTestQuestion',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createQuestion(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateTestQuestionInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.createQuestion(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'updateTestQuestion',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async updateQuestion(
    @AuthMember('id') teacherId: string,
    @Args('input') input: UpdateTestQuestionInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.updateQuestion(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'reorderTestQuestions',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async reorderQuestions(
    @AuthMember('id') teacherId: string,
    @Args('input') input: ReorderTestQuestionsInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.reorderQuestions(
        teacherId,
        input.testVersionId,
        input.questionIds,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'deleteTestDraftQuestion',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async deleteQuestion(
    @AuthMember('id') teacherId: string,
    @Args('input') input: TestVersionIdInput,
    @Args('questionId', { type: () => ID }) questionId: string,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.deleteQuestion(
        teacherId,
        input.testVersionId,
        questionId,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'publishTestVersion',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async publish(
    @AuthMember('id') teacherId: string,
    @Args('input') input: TestVersionIdInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.publish(
        teacherId,
        input.testVersionId,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestVersionPayloadObject, {
    name: 'createNextTestVersion',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async nextVersion(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateNextTestVersionInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestVersionPayloadObject> {
    return {
      testVersion: await this.authoring.createNextVersion(
        teacherId,
        input.testId,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestPayloadObject, { name: 'setTestArchived' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async setArchived(
    @AuthMember('id') teacherId: string,
    @Args('input') input: SetTestArchivedInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestPayloadObject> {
    return {
      test: await this.authoring.setArchived(
        teacherId,
        input.testId,
        input.archived,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => AttemptGrantPayloadObject, {
    name: 'grantAdditionalTestAttempt',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async grantAttempt(
    @AuthMember('id') teacherId: string,
    @Args('input') input: GrantAdditionalTestAttemptInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<AttemptGrantPayloadObject> {
    return {
      grant: await this.authoring.grantAttempt(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }
}
