import { Prisma, TestVersionStatus } from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../libs/enums/error-code.enum';
import { ApplicationError } from '../../../libs/errors/application.error';
import { parseUuid } from '../../../libs/pagination/cursor-pagination';
import type { TeacherTestVersionObject } from '../../../schemas/tests/authoring/test-draft.object';
import { TestDraftAccessService } from './test-draft-access.service';
import { versionInclude } from './test-version-record';
import { createOptions } from './test-draft-parsing';
import { validatePublishable } from './test-publication-validation';
import { mapVersion } from './test-version-mapping';
import { writeAudit } from './test-authoring-audit';
import { notFound } from './test-authoring-errors';

@Injectable()
export class TestPublicationService {
  constructor(
    private readonly testDraftAccessService: TestDraftAccessService,
    private readonly database: DatabaseService,
  ) {}
  async publish(
    teacherId: string,
    versionIdInput: string,
    expectedUpdatedAt: Date,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const updated = await this.testDraftAccessService.withDraft(
      teacherId,
      { id: parseUuid(versionIdInput, 'testVersionId') },
      expectedUpdatedAt,
      async (tx, version) => {
        validatePublishable(version);

        const row = await tx.testVersion.update({
          where: { id: version.id },
          data: {
            updatedAt: version.updatedAt,
            publishedAt: new Date(),
            status: TestVersionStatus.PUBLISHED,
          },
          include: versionInclude,
        });
        await writeAudit(
          tx,
          teacherId,
          'TEST_VERSION_PUBLISHED',
          'TEST_VERSION',
          row.id,
          correlationId,
          { version: row.version },
        );
        return row;
      },
    );
    return mapVersion(updated);
  }

  async createNextVersion(
    teacherId: string,
    testIdInput: string,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const testId = parseUuid(testIdInput, 'testId');
    const created = await this.database.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT t.id FROM tests t JOIN groups g ON g.id = t.group_id
        WHERE t.id = ${testId}::uuid AND g.teacher_id = ${teacherId}::uuid AND t.status = 'ACTIVE'
        FOR UPDATE OF t
      `;
        if (locked.length !== 1) throw notFound();
        const latest = await tx.testVersion.findFirst({
          where: { testId, test: { group: { teacherId } } },
          include: versionInclude,
          orderBy: { version: 'desc' },
        });
        if (latest === null) throw notFound();
        const draft = await tx.testVersion.findFirst({
          where: { testId, status: TestVersionStatus.DRAFT },
          select: { id: true },
        });
        if (draft !== null)
          throw new ApplicationError(
            ErrorCode.CONFLICT,
            'This test already has an editable draft',
            409,
          );

        const row = await tx.testVersion.create({
          data: {
            attemptLimit: latest.attemptLimit,
            availabilityEndsAt: latest.availabilityEndsAt,
            availabilityStartsAt: latest.availabilityStartsAt,
            durationMinutes: latest.durationMinutes,
            passingPercentage: latest.passingPercentage,
            primaryLanguage: latest.primaryLanguage,
            scoringRuleVersion: latest.scoringRuleVersion,
            testId,
            version: latest.version + 1,
            translations: {
              createMany: {
                data: latest.translations.map(
                  ({ description, language, title }) => ({
                    description,
                    language,
                    title,
                  }),
                ),
              },
            },
          },
        });
        const sectionIds = new Map<string, string>();
        for (const section of latest.sections) {
          const copiedSection = await tx.testSection.create({
            data: {
              mediaObjectId: section.mediaObjectId,
              minimumWords: section.minimumWords,
              position: section.position,
              preparationSeconds: section.preparationSeconds,
              responseSeconds: section.responseSeconds,
              suggestedMinutes: section.suggestedMinutes,
              testVersionId: row.id,
              translations: {
                createMany: {
                  data: section.translations.map(
                    ({ content, instructions, language, title }) => ({
                      content,
                      instructions,
                      language,
                      title,
                    }),
                  ),
                },
              },
            },
          });
          sectionIds.set(section.id, copiedSection.id);
        }
        const questionIds = new Map<string, string>();
        for (const question of latest.questions) {
          const copiedQuestion = await tx.question.create({
            data: {
              answerLimit: question.answerLimit,
              kind: question.kind,
              maxSelections: question.maxSelections,
              position: question.position,
              sectionId:
                question.section === null
                  ? null
                  : (sectionIds.get(question.section.id) ?? null),
              testVersionId: row.id,
              acceptedAnswers: {
                createMany: {
                  data: question.acceptedAnswers.map(
                    ({ displayValue, normalizedValue, position }) => ({
                      displayValue,
                      normalizedValue,
                      position,
                    }),
                  ),
                },
              },
              translations: {
                createMany: {
                  data: question.translations.map(
                    ({ language, prompt, rationale }) => ({
                      language,
                      prompt,
                      rationale,
                    }),
                  ),
                },
              },
            },
          });
          questionIds.set(question.id, copiedQuestion.id);
          await createOptions(
            tx,
            copiedQuestion.id,
            question.options.map((option) => ({
              isCorrect: option.isCorrect,
              translations: option.translations.map(({ language, text }) => ({
                language,
                text,
              })),
            })),
          );
        }
        for (const section of latest.sections) {
          const copiedSectionId = sectionIds.get(section.id);
          if (copiedSectionId === undefined)
            throw new Error('Copied section identity was not created');
          for (const block of section.blocks) {
            await tx.testSectionBlock.create({
              data: {
                headingLevel: block.headingLevel,
                kind: block.kind,
                mediaObjectId: block.mediaObjectId,
                position: block.position,
                tablePayload: block.tablePayload ?? Prisma.DbNull,
                testSectionId: copiedSectionId,
                translations: {
                  createMany: {
                    data: block.translations.map(
                      ({ altText, caption, language, text }) => ({
                        altText,
                        caption,
                        language,
                        text,
                      }),
                    ),
                  },
                },
                questions: {
                  createMany: {
                    data: block.questions.map(({ position, questionId }) => {
                      const copiedQuestionId = questionIds.get(questionId);
                      if (copiedQuestionId === undefined)
                        throw new Error(
                          'Copied question identity was not created',
                        );
                      return { position, questionId: copiedQuestionId };
                    }),
                  },
                },
              },
            });
          }
        }
        await writeAudit(
          tx,
          teacherId,
          'TEST_VERSION_DRAFTED',
          'TEST_VERSION',
          row.id,
          correlationId,
          { copiedFromVersionId: latest.id },
        );
        return tx.testVersion.findUniqueOrThrow({
          where: { id: row.id },
          include: versionInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    return mapVersion(created);
  }
}
