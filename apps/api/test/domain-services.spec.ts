import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestVersionStatus } from '@best/database';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';
import { AssetsService } from '../src/components/assets/assets.service';
import { AssetsStorageGateway } from '../src/components/assets/assets-storage.gateway';
import { ListeningAudioGateway } from '../src/components/tests/listening-audio.gateway';
import { TestsModule } from '../src/components/tests/tests.module';
import { AttemptsModule } from '../src/components/attempts/attempts.module';
import { ResultsModule } from '../src/components/results/results.module';
import { ApplicationError } from '../src/libs/errors/application.error';
import { ErrorCode } from '../src/libs/enums/error-code.enum';
import { calculateExpiresAt } from '../src/components/attempts/attempt-availability';
import { TestDraftAccessService } from '../src/components/tests/test-draft-access.service';
import { TestSectionsService } from '../src/components/tests/test-sections.service';
import { TestQuestionsService } from '../src/components/tests/test-questions.service';
import { TestPublicationService } from '../src/components/tests/test-publication.service';
import { TestListeningAudioService } from '../src/components/tests/test-listening-audio.service';
import { AttemptReadService } from '../src/components/attempts/attempt-read.service';
import { AttemptMediaService } from '../src/components/attempts/attempt-media.service';
import { AttemptLifecycleService } from '../src/components/attempts/attempt-lifecycle.service';
import { TeacherReviewService } from '../src/components/results/teacher-review.service';
import { TeacherProgressService } from '../src/components/results/teacher-progress.service';
import { TestsAuthoringService } from '../src/components/tests/tests-authoring.service';
import { AttemptsService } from '../src/components/attempts/attempts.service';
import { TeacherResultsService } from '../src/components/results/teacher-results.service';

void test('domain modules register and resolve every extracted provider', async () => {
  const registered: unknown[] = [
    TestsModule,
    AttemptsModule,
    ResultsModule,
  ].flatMap((module) => {
    const metadata: unknown = Reflect.getMetadata('providers', module);
    assert.ok(Array.isArray(metadata));
    return metadata.map((provider: unknown) => provider);
  });
  const services = [
    TestDraftAccessService,
    TestSectionsService,
    TestQuestionsService,
    TestPublicationService,
    TestListeningAudioService,
    AttemptReadService,
    AttemptMediaService,
    AttemptLifecycleService,
    TeacherReviewService,
    TeacherProgressService,
    TestsAuthoringService,
    AttemptsService,
    TeacherResultsService,
  ];
  for (const service of services)
    assert.ok(registered.includes(service), service.name);
  const module = await Test.createTestingModule({
    providers: [
      ...services,
      { provide: DatabaseService, useValue: {} },
      { provide: AssetsService, useValue: {} },
      { provide: AssetsStorageGateway, useValue: {} },
      { provide: ListeningAudioGateway, useValue: {} },
    ],
  }).compile();
  try {
    for (const service of services) assert.ok(module.get(service));
  } finally {
    await module.close();
  }
});

void test('draft access scopes ownership and rejects missing, published, or archived versions', async () => {
  const versionId = '00000000-0000-4000-8000-000000000001';
  const teacherId = '00000000-0000-4000-8000-000000000002';
  let version: {
    id: string;
    testId: string;
    status: TestVersionStatus;
  } | null = null;
  let active = true;
  let query: unknown;
  const module = await Test.createTestingModule({
    providers: [
      TestDraftAccessService,
      {
        provide: DatabaseService,
        useValue: {
          testVersion: {
            findFirst: (input: unknown) => {
              query = input;
              return Promise.resolve(version);
            },
          },
          test: { count: () => Promise.resolve(active ? 1 : 0) },
        },
      },
    ],
  }).compile();
  try {
    const service = module.get(TestDraftAccessService);
    await assert.rejects(
      service.requireDraft(teacherId, versionId),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === ErrorCode.NOT_FOUND,
    );
    assert.ok(typeof query === 'object' && query !== null && 'where' in query);
    assert.deepEqual(query.where, {
      id: versionId,
      test: { group: { teacherId } },
    });
    version = {
      id: versionId,
      testId: versionId,
      status: TestVersionStatus.PUBLISHED,
    };
    await assert.rejects(
      service.requireDraft(teacherId, versionId),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === ErrorCode.CONFLICT,
    );
    version.status = TestVersionStatus.DRAFT;
    active = false;
    await assert.rejects(
      service.requireDraft(teacherId, versionId),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === ErrorCode.CONFLICT,
    );
    active = true;
    assert.equal(await service.requireDraft(teacherId, versionId), version);
  } finally {
    await module.close();
  }
});

void test('attempt expiration respects the earlier server-owned availability limit', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const close = new Date('2026-01-01T00:20:00Z');
  assert.equal(calculateExpiresAt(start, 60, close), close);
  assert.equal(calculateExpiresAt(start, null, close), close);
  assert.equal(
    calculateExpiresAt(start, 10, close)?.toISOString(),
    '2026-01-01T00:10:00.000Z',
  );
  assert.equal(calculateExpiresAt(start, null, null), null);
});
