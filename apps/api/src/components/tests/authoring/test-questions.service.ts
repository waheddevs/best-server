import { QuestionKind, TestVersionStatus } from '@best/database';
import { Injectable } from '@nestjs/common';
import { parseUuid } from '../../../libs/pagination/cursor-pagination';
import type {
  CreateTestQuestionInput,
  UpdateTestQuestionInput,
} from '../../../schemas/tests/authoring/test-question.input';
import type { TeacherTestVersionObject } from '../../../schemas/tests/authoring/test-draft.object';
import { TestDraftAccessService } from './test-draft-access.service';
import { versionInclude } from './test-version-record';
import { parseQuestion, createOptions } from './test-draft-parsing';
import { mapVersion } from './test-version-mapping';
import { writeAudit } from './test-authoring-audit';
import { validationError, notFound } from './test-authoring-errors';

@Injectable()
export class TestQuestionsService {
  constructor(
    private readonly testDraftAccessService: TestDraftAccessService,
  ) {}
  async createQuestion(
    teacherId: string,
    input: CreateTestQuestionInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const updated = await this.testDraftAccessService.withDraft(
      teacherId,
      { id: parseUuid(input.testVersionId, 'testVersionId') },
      input.expectedUpdatedAt,
      async (tx, version) => {
        const question = parseQuestion(
          input,
          version.primaryLanguage,
          QuestionKind.SINGLE_CHOICE,
        );
        await this.testDraftAccessService.requireVersionSection(
          version.id,
          question.sectionId,
          tx,
        );

        const count = await tx.question.count({
          where: { testVersionId: version.id },
        });
        const created = await tx.question.create({
          data: {
            answerLimit: question.answerLimit,
            kind: question.kind,
            maxSelections: question.maxSelections,
            position: count + 1,
            sectionId: question.sectionId,
            testVersionId: version.id,
            acceptedAnswers: {
              createMany: { data: question.acceptedAnswers },
            },
            translations: { createMany: { data: question.translations } },
          },
        });
        await createOptions(tx, created.id, question.options);
        await writeAudit(
          tx,
          teacherId,
          'TEST_QUESTION_CREATED',
          'QUESTION',
          created.id,
          correlationId,
          { testVersionId: version.id },
        );
        return tx.testVersion.findUniqueOrThrow({
          where: { id: version.id },
          include: versionInclude,
        });
      },
    );
    return mapVersion(updated);
  }

  async updateQuestion(
    teacherId: string,
    input: UpdateTestQuestionInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const updated = await this.testDraftAccessService.withDraft(
      teacherId,
      {
        questions: { some: { id: parseUuid(input.questionId, 'questionId') } },
      },
      input.expectedUpdatedAt,
      async (tx) => {
        const questionId = parseUuid(input.questionId, 'questionId');
        const existing = await tx.question.findFirst({
          where: {
            id: questionId,
            testVersion: {
              status: TestVersionStatus.DRAFT,
              test: { group: { teacherId } },
            },
          },
          select: {
            kind: true,
            id: true,
            testVersion: { select: { id: true, primaryLanguage: true } },
          },
        });
        if (existing === null) throw notFound();
        const values = parseQuestion(
          input,
          existing.testVersion.primaryLanguage,
          existing.kind,
        );
        await this.testDraftAccessService.requireVersionSection(
          existing.testVersion.id,
          values.sectionId,
          tx,
        );

        await tx.answerOption.deleteMany({ where: { questionId } });
        await tx.questionAcceptedAnswer.deleteMany({ where: { questionId } });
        await tx.questionTranslation.deleteMany({ where: { questionId } });
        await tx.question.update({
          where: { id: questionId },
          data: {
            answerLimit: values.answerLimit,
            kind: values.kind,
            maxSelections: values.maxSelections,
            sectionId: values.sectionId,
            acceptedAnswers: { createMany: { data: values.acceptedAnswers } },
            translations: { createMany: { data: values.translations } },
          },
        });
        await createOptions(tx, questionId, values.options);
        await writeAudit(
          tx,
          teacherId,
          'TEST_QUESTION_UPDATED',
          'QUESTION',
          questionId,
          correlationId,
        );
        return tx.testVersion.findUniqueOrThrow({
          where: { id: existing.testVersion.id },
          include: versionInclude,
        });
      },
    );
    return mapVersion(updated);
  }

  async reorderQuestions(
    teacherId: string,
    versionIdInput: string,
    questionIdInputs: string[],
    expectedUpdatedAt: Date,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const updated = await this.testDraftAccessService.withDraft(
      teacherId,
      { id: parseUuid(versionIdInput, 'testVersionId') },
      expectedUpdatedAt,
      async (tx, version) => {
        const questionIds = questionIdInputs.map((id) =>
          parseUuid(id, 'questionId'),
        );
        const uniqueIds = new Set(questionIds);
        const existing = await tx.question.findMany({
          where: { testVersionId: version.id },
          select: { id: true },
        });
        if (
          uniqueIds.size !== questionIds.length ||
          existing.length !== questionIds.length ||
          existing.some(({ id }) => !uniqueIds.has(id))
        ) {
          throw validationError(
            'questionIds must contain every draft question exactly once',
          );
        }

        await tx.question.updateMany({
          where: { testVersionId: version.id },
          data: { position: { increment: questionIds.length + 1000 } },
        });
        for (const [index, id] of questionIds.entries())
          await tx.question.update({
            where: { id },
            data: { position: index + 1 },
          });
        await writeAudit(
          tx,
          teacherId,
          'TEST_QUESTIONS_REORDERED',
          'TEST_VERSION',
          version.id,
          correlationId,
          { questionIds },
        );
        return tx.testVersion.findUniqueOrThrow({
          where: { id: version.id },
          include: versionInclude,
        });
      },
    );
    return mapVersion(updated);
  }

  async deleteQuestion(
    teacherId: string,
    versionIdInput: string,
    questionIdInput: string,
    expectedUpdatedAt: Date,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const updated = await this.testDraftAccessService.withDraft(
      teacherId,
      { id: parseUuid(versionIdInput, 'testVersionId') },
      expectedUpdatedAt,
      async (tx, version) => {
        const questionId = parseUuid(questionIdInput, 'questionId');
        const target = await tx.question.findFirst({
          where: { id: questionId, testVersionId: version.id },
          select: { position: true },
        });
        if (target === null) throw notFound();

        await tx.question.delete({ where: { id: questionId } });
        await tx.question.updateMany({
          where: {
            testVersionId: version.id,
            position: { gt: target.position },
          },
          data: { position: { decrement: 1 } },
        });
        await writeAudit(
          tx,
          teacherId,
          'TEST_QUESTION_DELETED',
          'QUESTION',
          questionId,
          correlationId,
          { testVersionId: version.id },
        );
        return tx.testVersion.findUniqueOrThrow({
          where: { id: version.id },
          include: versionInclude,
        });
      },
    );
    return mapVersion(updated);
  }
}
