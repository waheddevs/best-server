import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import {
  createServer as createTcpServer,
  type Server as TcpServer,
  type Socket,
} from 'node:net';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';

import { loadInfrastructureEnvironment } from '@best/config';
import {
  AssignmentStatus,
  AttemptStatus,
  AttemptSubmissionReason,
  ContentStatus,
  GroupCategory,
  GroupMembershipStatus,
  IeltsModule,
  Language,
  LibraryVisibility,
  MediaMalwareStatus,
  MediaObjectSource,
  MediaObjectStatus,
  MediaType,
  MediaVisibility,
  PublicContentStatus,
  PublicCourseAccent,
  PublicCourseCategory,
  PublicEventTimelineStatus,
  QuestionKind,
  TestSkill,
  TestSectionBlockKind,
  TestVersionStatus,
  UserRole,
  UserStatus,
} from '@best/database';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/components/auth/auth.service';
import { CredentialPasswordService } from '../src/components/auth/credential-password.service';
import { CREDENTIAL_EMAIL_SENDER } from '../src/components/auth/auth.constants';
import type {
  CredentialEmailSender,
  CredentialLoginCodeMessage,
} from '../src/components/auth/credential-email-sender.type';
import {
  type GeneratedListeningAudio,
  ListeningAudioGateway,
} from '../src/components/tests/listening-audio.gateway';
import { DatabaseService } from '../src/database/database.service';

class CapturingCredentialEmailSender implements CredentialEmailSender {
  private latestMessage: CredentialLoginCodeMessage | undefined;

  clear(): void {
    this.latestMessage = undefined;
  }

  getLatestMessage(): CredentialLoginCodeMessage | undefined {
    return this.latestMessage;
  }

  sendLoginCode(message: CredentialLoginCodeMessage): Promise<void> {
    this.latestMessage = message;
    return Promise.resolve();
  }
}

class FakeListeningAudioGateway extends ListeningAudioGateway {
  readonly maxTranscriptCharacters = 20_000;

  generate(): Promise<GeneratedListeningAudio> {
    return Promise.resolve({
      bytes: createFakeWav(),
      durationSeconds: 1,
      engine: 'INTEGRATION_TEST',
      engineVersion: '1.0.0',
      mimeType: 'audio/wav',
      voice: 'bf_emma',
    });
  }
}

const RUNTIME_ENVIRONMENT_NAMES = [
  'AUTH_EMAIL_DELIVERY_MODE',
  'AUTH_OTP_HASH_SECRET',
  'CLAMAV_CONNECT_TIMEOUT_MS',
  'CLAMAV_HOST',
  'CLAMAV_PORT',
  'CLAMAV_SCAN_TIMEOUT_MS',
  'S3_ACCESS_KEY_ID',
  'S3_BUCKET',
  'S3_DOWNLOAD_URL_TTL_SECONDS',
  'S3_ENDPOINT',
  'S3_FORCE_PATH_STYLE',
  'S3_MAX_UPLOAD_BYTES',
  'S3_REGION',
  'S3_SECRET_ACCESS_KEY',
  'S3_UPLOAD_URL_TTL_SECONDS',
] as const;

const databaseName = `best_api_test_${randomUUID().replaceAll('-', '')}`;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalRuntimeEnvironment = captureRuntimeEnvironment();
const environment = loadInfrastructureEnvironment();
const adminPool = new Pool({ connectionString: environment.postgres.url });
const testDatabaseUrl = createTestDatabaseUrl(
  environment.postgres.url,
  databaseName,
);

let app: INestApplication | undefined;
let fakeStorageServer: Server | undefined;
let fakeMalwareScannerServer: TcpServer | undefined;
let apiUrl: string;
let adminId: string;
let adminToken: string;
let studentToken: string;
let teacherToken: string;
let testId: string;
let groupId: string;
let teacherId: string;
let studentId: string;
let attemptMediaObjectId: string;
const credentialEmailSender = new CapturingCredentialEmailSender();
const execFileAsync = promisify(execFile);

before(async () => {
  fakeStorageServer = createFakeStorageServer();
  fakeMalwareScannerServer = createFakeMalwareScannerServer();
  await listen(fakeStorageServer);
  await listen(fakeMalwareScannerServer);
  configureFakeStorage(fakeStorageServer);
  configureFakeMalwareScanner(fakeMalwareScannerServer);
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  await applyMigrations(testDatabaseUrl);
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.AUTH_EMAIL_DELIVERY_MODE = 'disabled';
  process.env.AUTH_OTP_HASH_SECRET =
    'integration-otp-secret-that-is-longer-than-32-characters';
  const testingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CREDENTIAL_EMAIL_SENDER)
    .useValue(credentialEmailSender)
    .overrideProvider(ListeningAudioGateway)
    .useClass(FakeListeningAudioGateway)
    .compile();
  app = testingModule.createNestApplication({ abortOnError: false });
  app.useLogger(false);
  await app.listen(0, '127.0.0.1');
  apiUrl = `${await app.getUrl()}/graphql`;

  const database = app.get(DatabaseService);
  const authService = app.get(AuthService);
  const fixture = await createStudentTestFixture(database);
  adminId = randomUUID();
  await database.user.create({
    data: {
      displayName: 'Fake Admin',
      id: adminId,
      role: UserRole.ADMIN,
    },
  });
  testId = fixture.testId;
  groupId = fixture.groupId;
  teacherId = fixture.teacherId;
  studentId = fixture.studentId;
  attemptMediaObjectId = fixture.mediaObjectId;
  studentToken = await authService.issueAccessToken({
    id: fixture.studentId,
    role: UserRole.STUDENT,
  });
  teacherToken = await authService.issueAccessToken({
    id: fixture.teacherId,
    role: UserRole.TEACHER,
  });
  adminToken = await authService.issueAccessToken({
    id: adminId,
    role: UserRole.ADMIN,
  });
});

void test('Teacher dashboard metrics come from owned memberships and account creation', async () => {
  const operation = `query TeacherDashboardMetrics {
    teacherDashboard {
      newLearnersThisMonth
      totalActiveLearners
      departedThisMonth
      monthsWithBest
    }
  }`;
  const response = await executeGraphql(teacherToken, operation);
  const dashboard = requireRecordField(response, 'teacherDashboard');
  assert.equal(dashboard.newLearnersThisMonth, 1);
  assert.equal(dashboard.totalActiveLearners, 1);
  assert.equal(dashboard.departedThisMonth, 0);
  assert.equal(dashboard.monthsWithBest, 0);

  const forbidden = await executeGraphqlExpectingErrors(
    studentToken,
    operation,
  );
  assert.ok(requireArrayField(forbidden, 'errors').length > 0);
});

void test('Teacher finance snapshots are persisted, owner-scoped, and role protected', async () => {
  const database = requireApp().get(DatabaseService);
  await database.teacherFinanceSnapshot.create({
    data: {
      activeGroups: 6,
      activeLearners: 118,
      attendanceRate: '89.40',
      expectedAmountUzs: 28_400_000n,
      expensesUzs: 14_200_000n,
      incomeUzs: 21_850_000n,
      month: 8,
      penaltiesUzs: 0n,
      teacherId,
      year: 2026,
    },
  });
  const persisted = await database.teacherFinanceSnapshot.findUniqueOrThrow({
    where: { teacherId_year_month: { month: 8, teacherId, year: 2026 } },
  });
  assert.equal(persisted.incomeUzs, 21_850_000n);

  const operation = `query TeacherFinanceSnapshots($year: Int!) {
    teacherFinanceSnapshots(year: $year) {
      year
      snapshots {
        year
        month
        incomeUzs
        expectedAmountUzs
        debtUzs
        expensesUzs
        penaltiesUzs
        activeLearners
        activeGroups
        attendanceRate
        paymentRate
      }
    }
  }`;
  const response = await executeGraphql(teacherToken, operation, {
    year: 2026,
  });
  const finance = requireRecordField(response, 'teacherFinanceSnapshots');
  const snapshot = requireRecord(
    requireArrayField(finance, 'snapshots')[0],
    'Teacher finance snapshot',
  );
  assert.equal(finance.year, 2026);
  assert.equal(snapshot.incomeUzs, '21850000');
  assert.equal(snapshot.debtUzs, '6550000');
  assert.equal(snapshot.paymentRate, 76.9);

  const forbidden = await executeGraphqlExpectingErrors(
    studentToken,
    operation,
    {
      year: 2026,
    },
  );
  assert.ok(requireArrayField(forbidden, 'errors').length > 0);
});

void test('Teacher practices use owned, stable 16-item numeric pages', async () => {
  const database = requireApp().get(DatabaseService);
  const practiceGroupId = randomUUID();
  await database.group.create({
    data: {
      id: practiceGroupId,
      name: 'Reserved Practice Catalog',
      paymentDeadlineDay: 10,
      slug: `practice-catalog-${practiceGroupId}`,
      teacherId,
    },
  });
  await database.testPaper.createMany({
    data: Array.from({ length: 48 }, (_, index) => {
      const practiceNumber = index + 1;
      return {
        academicYear: 2026,
        createdById: teacherId,
        groupId: practiceGroupId,
        practiceNumber,
        slug: `reserved-practice-${String(practiceNumber)}`,
        sourceLabel: 'Fictional integration fixture.',
        title: `Reserved practice ${String(practiceNumber)}`,
      };
    }),
  });
  const firstPractice = await database.testPaper.findUniqueOrThrow({
    where: {
      groupId_practiceNumber: { groupId: practiceGroupId, practiceNumber: 1 },
    },
  });
  const speakingCategory = await database.testCategory.create({
    data: {
      name: `Reserved Speaking ${practiceGroupId}`,
      teacherId,
    },
  });
  const speakingTest = await database.test.create({
    data: {
      categoryId: speakingCategory.id,
      groupId: practiceGroupId,
      paperId: firstPractice.id,
      skill: TestSkill.SPEAKING,
    },
  });
  await database.test.createMany({
    data: [TestSkill.LISTENING, TestSkill.READING, TestSkill.WRITING].map(
      (skill) => ({
        categoryId: speakingCategory.id,
        groupId: practiceGroupId,
        paperId: firstPractice.id,
        skill,
      }),
    ),
  });
  const speakingVersion = await database.testVersion.create({
    data: {
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'manual-rubric-v1',
      testId: speakingTest.id,
      translations: {
        create: {
          description: 'Reserved Speaking integration fixture.',
          language: Language.EN,
          title: 'Reserved Speaking test',
        },
      },
      version: 1,
    },
  });
  let speakingQuestionPosition = 1;
  for (const [sectionIndex, questionCount] of [4, 1, 4].entries()) {
    const section = await database.testSection.create({
      data: {
        position: sectionIndex + 1,
        testVersionId: speakingVersion.id,
        translations: {
          create: {
            content: 'Reserved Speaking section content.',
            instructions: 'Answer the questions naturally.',
            language: Language.EN,
            title: `Reserved Speaking Part ${String(sectionIndex + 1)}`,
          },
        },
      },
    });
    for (let index = 0; index < questionCount; index += 1) {
      await database.question.create({
        data: {
          kind: QuestionKind.AUDIO_RESPONSE,
          position: speakingQuestionPosition,
          sectionId: section.id,
          testVersionId: speakingVersion.id,
          translations: {
            create: {
              language: Language.EN,
              prompt: `Reserved Speaking prompt ${String(speakingQuestionPosition)}`,
            },
          },
        },
      });
      speakingQuestionPosition += 1;
    }
  }
  await database.testVersion.update({
    data: {
      publishedAt: new Date(),
      status: TestVersionStatus.PUBLISHED,
    },
    where: { id: speakingVersion.id },
  });
  const completedStudentId = randomUUID();
  await database.user.create({
    data: {
      displayName: 'Reserved Completed Student',
      id: completedStudentId,
      role: UserRole.STUDENT,
    },
  });
  const completedMembership = await database.groupMembership.create({
    data: {
      groupId: practiceGroupId,
      studentId: completedStudentId,
    },
  });
  await database.attempt.create({
    data: {
      attemptNumber: 1,
      groupMembershipId: completedMembership.id,
      status: AttemptStatus.SUBMITTED,
      studentId: completedStudentId,
      submissionReason: AttemptSubmissionReason.MANUAL,
      submittedAt: new Date(),
      testVersionId: speakingVersion.id,
    },
  });

  const operation = `query TeacherPracticePage($groupId: ID!, $page: Int!) {
    teacherTestPapers(groupId: $groupId, page: $page) {
      items {
        id isSaved practiceNumber title slug createdAt completedStudentCount
        skills { testId }
      }
      pageInfo {
        currentPage pageSize totalItems totalPages hasNextPage hasPreviousPage
      }
    }
  }`;
  for (const [page, firstNumber, lastNumber] of [
    [1, 1, 16],
    [2, 17, 32],
    [3, 33, 48],
  ] as const) {
    const response = await executeGraphql(teacherToken, operation, {
      groupId: practiceGroupId,
      page,
    });
    const catalog = requireRecordField(response, 'teacherTestPapers');
    const items = requireArrayField(catalog, 'items');
    assert.equal(items.length, 16);
    assert.deepEqual(
      items.map((item) =>
        Number(requireRecord(item, 'Teacher practice').practiceNumber),
      ),
      Array.from({ length: 16 }, (_, index) => firstNumber + index),
    );
    assert.equal(
      Number(requireRecord(items[0], 'First Teacher practice').practiceNumber),
      firstNumber,
    );
    if (page === 1) {
      assert.equal(
        requireRecord(items[0], 'First Teacher practice').completedStudentCount,
        1,
      );
      assert.equal(
        typeof requireRecord(items[0], 'First Teacher practice').createdAt,
        'string',
      );
    }
    assert.equal(
      Number(
        requireRecord(items.at(-1), 'Last Teacher practice').practiceNumber,
      ),
      lastNumber,
    );
    assert.deepEqual(requireRecordField(catalog, 'pageInfo'), {
      currentPage: page,
      hasNextPage: page < 3,
      hasPreviousPage: page > 1,
      pageSize: 16,
      totalItems: 48,
      totalPages: 3,
    });
  }

  const beyond = await executeGraphql(teacherToken, operation, {
    groupId: practiceGroupId,
    page: 4,
  });
  const beyondCatalog = requireRecordField(beyond, 'teacherTestPapers');
  assert.deepEqual(requireArrayField(beyondCatalog, 'items'), []);
  assert.deepEqual(requireRecordField(beyondCatalog, 'pageInfo'), {
    currentPage: 4,
    hasNextPage: false,
    hasPreviousPage: true,
    pageSize: 16,
    totalItems: 48,
    totalPages: 3,
  });

  const invalidPage = await executeGraphqlExpectingErrors(
    teacherToken,
    operation,
    { groupId: practiceGroupId, page: 0 },
  );
  assert.match(JSON.stringify(invalidPage), /BAD_USER_INPUT/);

  const savedBookmark = await executeGraphql(
    teacherToken,
    `mutation SavePractice($input: SetPracticeBookmarkInput!) {
      setPracticeBookmark(input: $input) { testPaperId saved }
    }`,
    { input: { saved: true, testPaperId: firstPractice.id } },
  );
  assert.equal(
    requireRecordField(savedBookmark, 'setPracticeBookmark').saved,
    true,
  );
  const refreshedCatalog = requireRecordField(
    await executeGraphql(teacherToken, operation, {
      groupId: practiceGroupId,
      page: 1,
    }),
    'teacherTestPapers',
  );
  assert.equal(
    requireRecord(
      requireArrayField(refreshedCatalog, 'items')[0],
      'Bookmarked practice',
    ).isSaved,
    true,
  );

  const otherTeacherId = randomUUID();
  await database.user.create({
    data: {
      displayName: 'Reserved Catalog Teacher',
      id: otherTeacherId,
      role: UserRole.TEACHER,
    },
  });
  const otherTeacherToken = await requireApp()
    .get(AuthService)
    .issueAccessToken({ id: otherTeacherId, role: UserRole.TEACHER });
  const hidden = await executeGraphqlExpectingErrors(
    otherTeacherToken,
    operation,
    { groupId: practiceGroupId, page: 1 },
  );
  assert.match(JSON.stringify(hidden), /NOT_FOUND/);

  const versionResponse = await executeGraphql(
    teacherToken,
    `query TeacherSpeakingVersion($testVersionId: ID!) {
      teacherTestVersion(testVersionId: $testVersionId) {
        questions { position sectionPosition }
        sections {
          position
          translations { language title instructions content }
        }
      }
    }`,
    { testVersionId: speakingVersion.id },
  );
  const version = requireRecordField(versionResponse, 'teacherTestVersion');
  const versionQuestions = requireArrayField(version, 'questions');
  assert.deepEqual(
    versionQuestions.map((question) =>
      Number(
        requireRecord(question, 'Teacher Speaking question').sectionPosition,
      ),
    ),
    [1, 1, 1, 1, 2, 3, 3, 3, 3],
  );
  const versionSections = requireArrayField(version, 'sections');
  assert.deepEqual(
    versionSections.map((section) =>
      Number(requireRecord(section, 'Teacher test section').position),
    ),
    [1, 2, 3],
  );
  assert.ok(
    requireArrayField(
      requireRecord(versionSections[0], 'Teacher test section'),
      'translations',
    ).length > 0,
  );

  const deletionMutation = `mutation DeleteTeacherPractice($testPaperId: ID!) {
    deleteTeacherPracticeTest(testPaperId: $testPaperId) {
      testPaperId status deletedSkillCount
    }
  }`;
  const forbiddenDeletion = await executeGraphqlExpectingErrors(
    otherTeacherToken,
    deletionMutation,
    { testPaperId: firstPractice.id },
  );
  assert.match(JSON.stringify(forbiddenDeletion), /NOT_FOUND/);

  const deletion = requireRecordField(
    await executeGraphql(teacherToken, deletionMutation, {
      testPaperId: firstPractice.id,
    }),
    'deleteTeacherPracticeTest',
  );
  assert.deepEqual(deletion, {
    deletedSkillCount: 4,
    status: ContentStatus.DELETED,
    testPaperId: firstPractice.id,
  });
  const deletedPaper = await database.testPaper.findUniqueOrThrow({
    where: { id: firstPractice.id },
    select: { archivedAt: true, status: true },
  });
  assert.equal(deletedPaper.status, ContentStatus.DELETED);
  assert.ok(deletedPaper.archivedAt instanceof Date);
  const deletedSkills = await database.test.findMany({
    where: { paperId: firstPractice.id },
    select: { archivedAt: true, status: true },
  });
  assert.equal(deletedSkills.length, 4);
  assert.ok(
    deletedSkills.every(
      ({ archivedAt, status }) =>
        status === ContentStatus.DELETED && archivedAt instanceof Date,
    ),
  );
  const afterDeletion = requireRecordField(
    await executeGraphql(teacherToken, operation, {
      groupId: practiceGroupId,
      page: 1,
    }),
    'teacherTestPapers',
  );
  assert.equal(requireRecordField(afterDeletion, 'pageInfo').totalItems, 47);
  assert.ok(
    requireArrayField(afterDeletion, 'items').every(
      (item) =>
        requireRecord(item, 'Remaining practice').id !== firstPractice.id,
    ),
  );
  assert.equal(
    await database.auditLog.count({
      where: {
        action: 'TEACHER_PRACTICE_TEST_DELETED',
        targetId: firstPractice.id,
      },
    }),
    1,
  );
});

void test('Teacher creates empty Academic practices with owned concurrent numbering', async () => {
  const database = requireApp().get(DatabaseService);
  const historicalActive = await database.testPaper.create({
    data: {
      academicYear: 2025,
      createdById: teacherId,
      groupId,
      ieltsModule: IeltsModule.GENERAL_TRAINING,
      practiceNumber: 7,
      slug: `reserved-historical-active-${groupId}`,
      sourceLabel: 'Reserved General Training history fixture.',
      title: 'Reserved historical General Training paper',
    },
  });
  await database.testPaper.create({
    data: {
      academicYear: 2024,
      createdById: teacherId,
      groupId,
      ieltsModule: IeltsModule.GENERAL_TRAINING,
      practiceNumber: 12,
      slug: `reserved-historical-deleted-${groupId}`,
      sourceLabel: 'Reserved deleted history fixture.',
      archivedAt: new Date(),
      status: ContentStatus.DELETED,
      title: 'Reserved deleted historical paper',
    },
  });
  const category = await database.testCategory.create({
    data: { name: `Reserved GT runtime ${groupId}`, teacherId },
  });
  const historicalTest = await database.test.create({
    data: {
      categoryId: category.id,
      groupId,
      paperId: historicalActive.id,
      skill: TestSkill.READING,
      versions: {
        create: {
          primaryLanguage: Language.EN,
          scoringRuleVersion: 'manual-rubric-v1',
          translations: {
            create: {
              language: Language.EN,
              title: 'Reserved General Training reading',
            },
          },
          version: 1,
        },
      },
    },
    select: { versions: { select: { id: true } } },
  });
  const historicalVersionId = historicalTest.versions[0]?.id;
  assert.ok(historicalVersionId);
  const historicalSection = await database.testSection.create({
    data: {
      position: 1,
      testVersionId: historicalVersionId,
      translations: {
        create: {
          instructions: 'Write a reserved response.',
          language: Language.EN,
          title: 'Reserved General Training section',
        },
      },
    },
  });
  await database.question.create({
    data: {
      kind: QuestionKind.LONG_TEXT,
      position: 1,
      sectionId: historicalSection.id,
      testVersionId: historicalVersionId,
      translations: {
        create: {
          language: Language.EN,
          prompt: 'Write a reserved integration response.',
        },
      },
    },
  });
  await database.testVersion.update({
    where: { id: historicalVersionId },
    data: {
      publishedAt: new Date(),
      status: TestVersionStatus.PUBLISHED,
    },
  });

  const mutation = `mutation CreateTeacherPractice($input: CreateTeacherPracticeTestInput!) {
    createTeacherPracticeTest(input: $input) {
      testPaper {
        id practiceNumber slug academicYear ieltsModule title sourceLabel isSaved
        skills { testId }
      }
    }
  }`;
  const create = async () =>
    requireRecordField(
      requireRecordField(
        await executeGraphql(teacherToken, mutation, {
          input: { groupId },
        }),
        'createTeacherPracticeTest',
      ),
      'testPaper',
    );

  const first = await create();
  const second = await create();
  assert.equal(first.practiceNumber, 13);
  assert.equal(first.title, 'Practice test 13');
  assert.equal(first.ieltsModule, IeltsModule.ACADEMIC);
  assert.equal(first.isSaved, false);
  assert.deepEqual(first.skills, []);
  assert.equal(second.practiceNumber, 14);
  assert.equal(second.title, 'Practice test 14');

  const concurrent = await Promise.all([create(), create()]);
  assert.deepEqual(
    concurrent
      .map((paper) => Number(paper.practiceNumber))
      .sort((left, right) => left - right),
    [15, 16],
  );
  const createdPaperIds = [first, second, ...concurrent].map(({ id }) =>
    String(id),
  );
  assert.equal(
    await database.test.count({
      where: { paperId: { in: createdPaperIds } },
    }),
    0,
  );
  assert.equal(
    await database.auditLog.count({
      where: {
        action: 'TEACHER_PRACTICE_TEST_CREATED',
        targetId: { in: createdPaperIds },
      },
    }),
    4,
  );

  const directQuery = `query TeacherPracticeByNumber($groupId: ID!, $practiceNumber: Int!) {
    teacherTestPaper(groupId: $groupId, practiceNumber: $practiceNumber) {
      id practiceNumber title ieltsModule skills { testId }
    }
  }`;
  const directPaper = requireRecordField(
    await executeGraphql(teacherToken, directQuery, {
      groupId,
      practiceNumber: 13,
    }),
    'teacherTestPaper',
  );
  assert.equal(directPaper.id, first.id);
  assert.equal(directPaper.title, 'Practice test 13');
  const missingDirectPaper = await executeGraphqlExpectingErrors(
    teacherToken,
    directQuery,
    { groupId, practiceNumber: 999 },
  );
  assert.match(JSON.stringify(missingDirectPaper), /NOT_FOUND/);

  const teacherCatalog = requireRecordField(
    await executeGraphql(
      teacherToken,
      `query AcademicTeacherPractices($groupId: ID!) {
        teacherTestPapers(groupId: $groupId) {
          items { id ieltsModule practiceNumber }
          pageInfo { totalItems }
        }
      }`,
      { groupId },
    ),
    'teacherTestPapers',
  );
  assert.equal(requireRecordField(teacherCatalog, 'pageInfo').totalItems, 4);
  assert.ok(
    requireArrayField(teacherCatalog, 'items').every(
      (item) =>
        requireRecord(item, 'Teacher Academic practice').ieltsModule ===
        IeltsModule.ACADEMIC,
    ),
  );

  const studentCatalog = requireRecordField(
    await executeGraphql(
      studentToken,
      `query AcademicStudentPractices {
        studentTestPapers(first: 20) {
          edges { node { id ieltsModule } }
        }
      }`,
    ),
    'studentTestPapers',
  );
  assert.ok(
    requireArrayField(studentCatalog, 'edges').every((edge) => {
      const node = requireRecordField(
        requireRecord(edge, 'Student practice edge'),
        'node',
      );
      return (
        node.id !== historicalActive.id &&
        node.ieltsModule === IeltsModule.ACADEMIC
      );
    }),
  );
  const hiddenStudentDetail = await executeGraphqlExpectingErrors(
    studentToken,
    `query HiddenGeneralTrainingPaper($paperId: ID!) {
      studentTestPaper(paperId: $paperId) { id }
    }`,
    { paperId: historicalActive.id },
  );
  assert.match(JSON.stringify(hiddenStudentDetail), /NOT_FOUND/);

  const otherTeacherId = randomUUID();
  await database.user.create({
    data: {
      displayName: 'Reserved Foreign Practice Teacher',
      id: otherTeacherId,
      role: UserRole.TEACHER,
    },
  });
  const otherTeacherToken = await requireApp()
    .get(AuthService)
    .issueAccessToken({ id: otherTeacherId, role: UserRole.TEACHER });
  const hiddenForeignCreate = await executeGraphqlExpectingErrors(
    otherTeacherToken,
    mutation,
    { input: { groupId } },
  );
  assert.match(JSON.stringify(hiddenForeignCreate), /NOT_FOUND/);
  const hiddenForeignPaper = await executeGraphqlExpectingErrors(
    otherTeacherToken,
    directQuery,
    { groupId, practiceNumber: 13 },
  );
  assert.match(JSON.stringify(hiddenForeignPaper), /NOT_FOUND/);
  const forbiddenStudentCreate = await executeGraphqlExpectingErrors(
    studentToken,
    mutation,
    { input: { groupId } },
  );
  assert.match(JSON.stringify(forbiddenStudentCreate), /FORBIDDEN/);
});

void test('easyIELTS importer loads all 39 pinned source tests idempotently', async () => {
  const database = requireApp().get(DatabaseService);
  const importGroupId = randomUUID();
  const importCategoryId = randomUUID();
  await database.group.create({
    data: {
      id: importGroupId,
      category: GroupCategory.IELTS,
      name: 'Reserved General Training Import',
      paymentDeadlineDay: 10,
      slug: `easyielts-import-${importGroupId}`,
      teacherId,
    },
  });
  await database.testCategory.create({
    data: {
      id: importCategoryId,
      name: `Reserved easyIELTS ${importGroupId}`,
      teacherId,
    },
  });

  const importerPath = resolve(
    __dirname,
    '../../../packages/database/prisma/import-easyielts-tests.ts',
  );
  const arguments_ = [
    '--experimental-strip-types',
    importerPath,
    '--group-id',
    importGroupId,
    '--category-id',
    importCategoryId,
    '--apply',
  ];
  const environment = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    NODE_ENV: 'test',
  };
  const firstRun = await execFileAsync(process.execPath, arguments_, {
    cwd: resolve(__dirname, '../../..'),
    env: environment,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.match(firstRun.stdout, /"createdSourceTests": 39/);

  const [papers, tests, versions, sections, questions, provenance] =
    await Promise.all([
      database.testPaper.findMany({ where: { groupId: importGroupId } }),
      database.test.count({ where: { groupId: importGroupId } }),
      database.testVersion.count({
        where: { test: { groupId: importGroupId } },
      }),
      database.testSection.count({
        where: { testVersion: { test: { groupId: importGroupId } } },
      }),
      database.question.count({
        where: { testVersion: { test: { groupId: importGroupId } } },
      }),
      database.testImportSource.count({
        where: { targetGroupId: importGroupId },
      }),
    ]);
  assert.equal(papers.length, 10);
  assert.ok(papers.every((paper) => paper.ieltsModule === 'GENERAL_TRAINING'));
  assert.equal(tests, 39);
  assert.equal(versions, 39);
  assert.equal(sections, 49);
  assert.equal(questions, 192);
  assert.equal(provenance, 39);

  const secondRun = await execFileAsync(process.execPath, arguments_, {
    cwd: resolve(__dirname, '../../..'),
    env: environment,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.match(secondRun.stdout, /"createdSourceTests": 0/);
  assert.match(secondRun.stdout, /"skippedSourceTests": 39/);
  assert.equal(
    await database.testImportSource.count({
      where: { targetGroupId: importGroupId },
    }),
    39,
  );
});

void test('Teacher creates one missing skill draft inside an owned practice paper', async () => {
  const database = requireApp().get(DatabaseService);
  const groupId = randomUUID();
  await database.group.create({
    data: {
      category: GroupCategory.IELTS,
      id: groupId,
      name: 'Reserved Skill Draft Group',
      paymentDeadlineDay: 10,
      slug: `skill-draft-${groupId}`,
      teacherId,
    },
  });
  const paper = await database.testPaper.create({
    data: {
      academicYear: 2026,
      createdById: teacherId,
      groupId,
      practiceNumber: 1,
      slug: `reserved-skill-draft-${groupId}`,
      sourceLabel: 'Fictional integration fixture.',
      title: 'Reserved skill draft paper',
    },
  });
  const mutation = `mutation CreatePaperSkill($input: CreateTestPaperSkillDraftInput!) {
    createTestPaperSkillDraft(input: $input) {
      testVersion {
        id primaryLanguage status
        translations { language title description }
      }
    }
  }`;
  const unrelatedTeacherId = randomUUID();
  await database.user.create({
    data: {
      displayName: 'Reserved Unrelated Skill Author',
      id: unrelatedTeacherId,
      role: UserRole.TEACHER,
    },
  });
  const unrelatedTeacherToken = await requireApp()
    .get(AuthService)
    .issueAccessToken({ id: unrelatedTeacherId, role: UserRole.TEACHER });
  const ownershipDenied = await executeGraphqlExpectingErrors(
    unrelatedTeacherToken,
    mutation,
    { input: { skill: 'WRITING', testPaperId: paper.id } },
  );
  assert.match(JSON.stringify(ownershipDenied), /NOT_FOUND/);

  const input = { skill: 'LISTENING', testPaperId: paper.id };
  const response = requireRecordField(
    await executeGraphql(teacherToken, mutation, { input }),
    'createTestPaperSkillDraft',
  );
  const version = requireRecordField(response, 'testVersion');
  assert.equal(version.primaryLanguage, 'EN');
  assert.equal(version.status, 'DRAFT');
  assert.match(
    String(
      requireRecord(
        requireArrayField(version, 'translations')[0],
        'Skill draft translation',
      ).title,
    ),
    /Listening/,
  );
  const storedTest = await database.test.findUnique({
    where: { paperId_skill: { paperId: paper.id, skill: TestSkill.LISTENING } },
    include: { versions: true },
  });
  assert.equal(storedTest?.versions[0]?.status, TestVersionStatus.DRAFT);

  const duplicate = await executeGraphqlExpectingErrors(
    teacherToken,
    mutation,
    {
      input,
    },
  );
  assert.match(JSON.stringify(duplicate), /CONFLICT/);
});

void test('Teacher authors and publishes an ordered typed Reading draft', async () => {
  const database = requireApp().get(DatabaseService);
  const authoringGroupId = randomUUID();
  await database.group.create({
    data: {
      id: authoringGroupId,
      name: 'Reserved Authoring Group',
      paymentDeadlineDay: 10,
      slug: `authoring-${authoringGroupId}`,
      teacherId,
    },
  });
  const category = await database.testCategory.create({
    data: { name: `Reserved Reading ${authoringGroupId}`, teacherId },
  });
  const paper = await database.testPaper.create({
    data: {
      academicYear: 2026,
      createdById: teacherId,
      groupId: authoringGroupId,
      practiceNumber: 1,
      slug: `reserved-authoring-${authoringGroupId}`,
      sourceLabel: 'Fictional integration fixture.',
      title: 'Reserved authoring paper',
    },
  });
  const readingTest = await database.test.create({
    data: {
      categoryId: category.id,
      groupId: authoringGroupId,
      paperId: paper.id,
      skill: TestSkill.READING,
    },
  });
  const draft = await database.testVersion.create({
    data: {
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'objective-v2',
      testId: readingTest.id,
      translations: {
        create: {
          description: 'Reserved dynamic Reading draft.',
          language: Language.EN,
          title: 'Reserved Reading draft',
        },
      },
      version: 1,
    },
  });

  const sectionResponse = await executeGraphql(
    teacherToken,
    `mutation CreateSection($input: CreateTestSectionInput!) {
      createTestSection(input: $input) {
        testVersion {
          id
          sections { id position suggestedMinutes translations { language title instructions } }
        }
      }
    }`,
    {
      input: {
        suggestedMinutes: 20,
        testVersionId: draft.id,
        translations: [
          {
            instructions: 'Read the fictional passage.',
            language: 'EN',
            title: 'Reserved Passage 1',
          },
        ],
      },
    },
  );
  const sectionVersion = requireRecordField(
    requireRecordField(sectionResponse, 'createTestSection'),
    'testVersion',
  );
  const sectionId = String(
    requireRecord(
      requireArrayField(sectionVersion, 'sections')[0],
      'Created section',
    ).id,
  );
  const incompleteValidation = requireRecordField(
    await executeGraphql(
      teacherToken,
      `query ValidateDraft($testVersionId: ID!) {
        validateTeacherTestDraft(testVersionId: $testVersionId) {
          isPublishable
          issues { code severity path message }
        }
      }`,
      { testVersionId: draft.id },
    ),
    'validateTeacherTestDraft',
  );
  assert.equal(incompleteValidation.isPublishable, false);
  assert.ok(
    requireArrayField(incompleteValidation, 'issues').some(
      (issue) =>
        requireRecord(issue, 'Validation issue').code === 'QUESTION_REQUIRED',
    ),
  );
  const unrelatedTeacherId = randomUUID();
  await database.user.create({
    data: {
      displayName: 'Reserved Unrelated Author',
      id: unrelatedTeacherId,
      role: UserRole.TEACHER,
    },
  });
  const unrelatedTeacherToken = await requireApp()
    .get(AuthService)
    .issueAccessToken({ id: unrelatedTeacherId, role: UserRole.TEACHER });
  const ownershipDenied = await executeGraphqlExpectingErrors(
    unrelatedTeacherToken,
    `mutation UpdateSection($input: UpdateTestSectionInput!) {
      updateTestSection(input: $input) { testVersion { id } }
    }`,
    {
      input: {
        testSectionId: sectionId,
        translations: [
          {
            instructions: 'Unauthorized change.',
            language: 'EN',
            title: 'Unauthorized',
          },
        ],
      },
    },
  );
  assert.match(JSON.stringify(ownershipDenied), /NOT_FOUND/);

  const questionResponse = await executeGraphql(
    teacherToken,
    `mutation CreateQuestion($input: CreateTestQuestionInput!) {
      createTestQuestion(input: $input) {
        testVersion {
          questions {
            id kind sectionId answerLimit acceptedAnswers
            translations { language prompt rationale }
          }
        }
      }
    }`,
    {
      input: {
        acceptedAnswers: ['Solar energy'],
        answerLimit: 2,
        kind: 'SHORT_TEXT',
        options: [],
        sectionId,
        testVersionId: draft.id,
        translations: [
          {
            language: 'EN',
            prompt: 'Which fictional energy source is described?',
            rationale: 'The passage names solar energy explicitly.',
          },
        ],
      },
    },
  );
  const question = requireRecord(
    requireArrayField(
      requireRecordField(
        requireRecordField(questionResponse, 'createTestQuestion'),
        'testVersion',
      ),
      'questions',
    )[0],
    'Created question',
  );
  const questionId = String(question.id);
  assert.equal(question.kind, 'SHORT_TEXT');
  assert.equal(question.sectionId, sectionId);
  assert.deepEqual(question.acceptedAnswers, ['Solar energy']);

  const acceptedAnswer = await database.questionAcceptedAnswer.findFirstOrThrow(
    {
      select: {
        displayValue: true,
        normalizedValue: true,
      },
      where: {
        questionId,
      },
    },
  );
  assert.deepEqual(acceptedAnswer, {
    displayValue: 'Solar energy',
    normalizedValue: 'solar energy',
  });

  const createBlockMutation = `mutation CreateBlock($input: CreateTestSectionBlockInput!) {
    createTestSectionBlock(input: $input) {
      testVersion {
        sections {
          blocks {
            id position kind questionIds
            translations { language text altText caption }
          }
        }
      }
    }
  }`;
  await executeGraphql(teacherToken, createBlockMutation, {
    input: {
      kind: 'RICH_TEXT',
      testSectionId: sectionId,
      translations: [
        {
          language: 'EN',
          text: 'Solar energy is the named source in this fictional passage.',
        },
      ],
    },
  });
  const grouped = await executeGraphql(teacherToken, createBlockMutation, {
    input: {
      kind: 'QUESTION_GROUP',
      questionIds: [questionId],
      testSectionId: sectionId,
      translations: [],
    },
  });
  const groupedVersion = requireRecordField(
    requireRecordField(grouped, 'createTestSectionBlock'),
    'testVersion',
  );
  const blocks = requireArrayField(
    requireRecord(
      requireArrayField(groupedVersion, 'sections')[0],
      'Authored section',
    ),
    'blocks',
  );
  assert.deepEqual(
    blocks.map((block) => requireRecord(block, 'Authored block').kind),
    ['RICH_TEXT', 'QUESTION_GROUP'],
  );

  const publishValidation = requireRecordField(
    await executeGraphql(
      teacherToken,
      `query ValidateDraft($testVersionId: ID!) {
        validateTeacherTestDraft(testVersionId: $testVersionId) {
          isPublishable
          issues { code severity path message }
        }
      }`,
      { testVersionId: draft.id },
    ),
    'validateTeacherTestDraft',
  );
  assert.equal(publishValidation.isPublishable, true);
  assert.deepEqual(requireArrayField(publishValidation, 'issues'), []);

  const published = await executeGraphql(
    teacherToken,
    `mutation Publish($input: TestVersionIdInput!) {
      publishTestVersion(input: $input) { testVersion { id status publishedAt } }
    }`,
    { input: { testVersionId: draft.id } },
  );
  assert.equal(
    requireRecordField(
      requireRecordField(published, 'publishTestVersion'),
      'testVersion',
    ).status,
    'PUBLISHED',
  );

  const immutable = await executeGraphqlExpectingErrors(
    teacherToken,
    `mutation UpdateSection($input: UpdateTestSectionInput!) {
      updateTestSection(input: $input) { testVersion { id } }
    }`,
    {
      input: {
        testSectionId: sectionId,
        translations: [
          {
            instructions: 'Changed after publication.',
            language: 'EN',
            title: 'Changed',
          },
        ],
      },
    },
  );
  assert.match(JSON.stringify(immutable), /NOT_FOUND|CONFLICT/);

  const hiddenFromStudent = await executeGraphqlExpectingErrors(
    studentToken,
    `query TeacherDraft($testVersionId: ID!) {
      teacherTestVersion(testVersionId: $testVersionId) {
        questions { acceptedAnswers translations { rationale } }
      }
    }`,
    { testVersionId: draft.id },
  );
  assert.ok(requireArrayField(hiddenFromStudent, 'errors').length > 0);
});

void test('Teacher generates, previews, and explicitly attaches Listening audio', async () => {
  const database = requireApp().get(DatabaseService);
  const fixtureId = randomUUID();
  const transcript =
    'This reserved integration transcript describes a fictional phone interview.';
  const group = await database.group.create({
    data: {
      category: GroupCategory.IELTS,
      name: 'Reserved Listening Audio Group',
      paymentDeadlineDay: 10,
      slug: `listening-audio-${fixtureId}`,
      teacherId,
    },
  });
  const category = await database.testCategory.create({
    data: { name: `Reserved Listening Audio ${fixtureId}`, teacherId },
  });
  const paper = await database.testPaper.create({
    data: {
      academicYear: 2026,
      createdById: teacherId,
      groupId: group.id,
      practiceNumber: 2,
      slug: `reserved-listening-audio-${fixtureId}`,
      sourceLabel: 'Fictional integration fixture.',
      title: 'Reserved listening audio paper',
    },
  });
  const listeningTest = await database.test.create({
    data: {
      categoryId: category.id,
      groupId: group.id,
      paperId: paper.id,
      skill: TestSkill.LISTENING,
    },
  });
  const draft = await database.testVersion.create({
    data: {
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'objective-v2',
      testId: listeningTest.id,
      translations: {
        create: {
          description: 'Reserved listening draft.',
          language: Language.EN,
          title: 'Reserved Listening',
        },
      },
      version: 1,
    },
  });
  const section = await database.testSection.create({
    data: {
      position: 1,
      testVersionId: draft.id,
      translations: {
        create: {
          instructions: 'Complete the reserved form.',
          language: Language.EN,
          title: 'Phone interview',
        },
      },
    },
  });

  const operation = `mutation GenerateAudio($input: GenerateListeningAudioInput!) {
    generateListeningAudio(input: $input) {
      audio { mediaObjectId url expiresAt durationSeconds }
    }
  }`;
  const generated = await executeGraphql(teacherToken, operation, {
    input: { testSectionId: section.id, transcript },
  });
  const audio = requireRecordField(
    requireRecordField(generated, 'generateListeningAudio'),
    'audio',
  );
  const mediaObjectId = requireStringField(audio, 'mediaObjectId');
  assert.equal(audio.durationSeconds, 1);
  assert.ok(Date.parse(requireStringField(audio, 'expiresAt')) > Date.now());

  const previewResponse = await fetch(requireStringField(audio, 'url'));
  assert.equal(previewResponse.status, 200);
  assert.equal(
    Buffer.from(await previewResponse.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    'RIFF',
  );

  const stagedMedia = await database.mediaObject.findUniqueOrThrow({
    where: { id: mediaObjectId },
  });
  assert.equal(stagedMedia.source, MediaObjectSource.SYSTEM_GENERATED);
  assert.equal(stagedMedia.status, MediaObjectStatus.READY);
  assert.equal(stagedMedia.malwareStatus, MediaMalwareStatus.CLEAN);
  assert.equal(stagedMedia.visibility, MediaVisibility.OWNER_ONLY);
  const unchangedSection = await database.testSection.findUniqueOrThrow({
    where: { id: section.id },
    include: { translations: true },
  });
  assert.equal(unchangedSection.mediaObjectId, null);
  assert.equal(unchangedSection.translations[0]?.content, null);

  await executeGraphql(
    teacherToken,
    `mutation ConfirmAudio($input: UpdateTestSectionInput!) {
      updateTestSection(input: $input) { testVersion { id } }
    }`,
    {
      input: {
        mediaObjectId,
        testSectionId: section.id,
        translations: [
          {
            content: transcript,
            instructions: 'Complete the reserved form.',
            language: 'EN',
            title: 'Phone interview',
          },
        ],
      },
    },
  );

  const attachedSection = await database.testSection.findUniqueOrThrow({
    where: { id: section.id },
    include: { mediaObject: true, translations: true },
  });
  assert.equal(attachedSection.mediaObjectId, mediaObjectId);
  assert.equal(
    attachedSection.mediaObject?.visibility,
    MediaVisibility.DOMAIN_AUTHORIZED,
  );
  assert.equal(attachedSection.translations[0]?.content, transcript);
  assert.ok(
    await database.auditLog.findFirst({
      where: {
        action: 'LISTENING_AUDIO_PREVIEW_GENERATED',
        actorId: teacherId,
        targetId: mediaObjectId,
      },
    }),
  );

  const forbidden = await executeGraphqlExpectingErrors(
    studentToken,
    operation,
    { input: { testSectionId: section.id, transcript } },
  );
  assert.ok(requireArrayField(forbidden, 'errors').length > 0);
});

void test('Admin task assignment persists a linked Teacher notification', async () => {
  const requestId = randomUUID();
  const title = `Reserved follow-up ${requestId.slice(0, 8)}`;
  const countBefore = await executeGraphql(
    teacherToken,
    `query { myUnreadNotificationCount }`,
  );
  const assigned = await executeGraphql(
    adminToken,
    `mutation Assign($input: AdminAssignTeacherTaskInput!) {
      adminAssignTeacherTask(input: $input) {
        task { id title status kind }
      }
    }`,
    {
      input: {
        kind: 'FOLLOW_UP',
        requestId,
        teacherId,
        title,
      },
    },
  );
  const task = requireRecordField(
    requireRecordField(assigned, 'adminAssignTeacherTask'),
    'task',
  );
  assert.equal(task.id, requestId);
  assert.equal(task.status, 'OPEN');
  const database = requireApp().get(DatabaseService);
  const storedTask = await database.teacherTask.findUnique({
    where: { id: requestId },
  });
  assert.equal(storedTask?.teacherId, teacherId);
  const storedNotice = await database.notification.findUnique({
    where: {
      recipientId_eventKey: {
        recipientId: teacherId,
        eventKey: `teacher-task:${requestId}`,
      },
    },
  });
  assert.ok(storedNotice);
  assert.deepEqual(storedNotice.payload, { taskId: requestId });
  const countAfter = await executeGraphql(
    teacherToken,
    `query { myUnreadNotificationCount }`,
  );
  assert.equal(
    countAfter.myUnreadNotificationCount,
    Number(countBefore.myUnreadNotificationCount) + 1,
  );
  const notices = await executeGraphql(
    teacherToken,
    `query { myNotifications(first: 8) {
      edges { node { id taskId title readAt } }
    } }`,
  );
  const edges = requireArrayField(
    requireRecordField(notices, 'myNotifications'),
    'edges',
  );
  const first = requireRecordField(
    requireRecord(edges[0], 'notification edge'),
    'node',
  );
  assert.equal(first.taskId, requestId);
  assert.equal(first.title, title);
  await executeGraphql(
    teacherToken,
    `mutation Read($input: MarkNotificationReadInput!) {
      markNotificationRead(input: $input) { notification { id taskId readAt } }
    }`,
    { input: { notificationId: storedNotice.id } },
  );
  const storedRead = await database.notification.findUnique({
    where: { id: storedNotice.id },
  });
  assert.notEqual(storedRead?.readAt, null);
  const repeated = await executeGraphql(
    adminToken,
    `mutation Assign($input: AdminAssignTeacherTaskInput!) {
      adminAssignTeacherTask(input: $input) { task { id } }
    }`,
    { input: { kind: 'FOLLOW_UP', requestId, teacherId, title } },
  );
  assert.equal(
    requireRecordField(
      requireRecordField(repeated, 'adminAssignTeacherTask'),
      'task',
    ).id,
    requestId,
  );
  const forbidden = await executeGraphqlExpectingErrors(
    studentToken,
    `mutation Assign($input: AdminAssignTeacherTaskInput!) {
      adminAssignTeacherTask(input: $input) { task { id } }
    }`,
    { input: { kind: 'FOLLOW_UP', requestId: randomUUID(), teacherId, title } },
  );
  assert.ok('errors' in forbidden);
});

void test('Student notifications are owner-scoped, paginated, and persist read state', async () => {
  const database = requireApp().get(DatabaseService);
  const fixtureStudentId = randomUUID();
  const fixtureEmail = `student-notifications-${randomUUID()}@example.test`;
  await database.user.create({
    data: {
      id: fixtureStudentId,
      displayName: 'Fictional Notification Student',
      email: fixtureEmail,
      role: UserRole.STUDENT,
    },
  });
  const fixtureToken = await requireApp().get(AuthService).issueAccessToken({
    id: fixtureStudentId,
    role: UserRole.STUDENT,
  });
  const unreadBefore = await executeGraphql(
    fixtureToken,
    `query { myUnreadNotificationCount }`,
  );
  const seedPath = resolve(
    __dirname,
    '../../../packages/database/prisma/seed-student-notifications.ts',
  );
  const seedArguments = ['--experimental-strip-types', seedPath];
  const seedOptions = {
    cwd: resolve(__dirname, '../../..'),
    env: {
      ...process.env,
      BEST_FIXTURE_STUDENT_EMAIL: fixtureEmail,
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: 'test',
    },
  };
  const dryRun = await execFileAsync(
    process.execPath,
    seedArguments,
    seedOptions,
  );
  assert.match(dryRun.stdout, /"toCreate":5/);
  assert.equal(
    await database.notification.count({
      where: {
        recipientId: fixtureStudentId,
        eventKey: { startsWith: 'demo:student-notification:' },
      },
    }),
    0,
  );
  const seeded = await execFileAsync(
    process.execPath,
    [...seedArguments, '--apply'],
    seedOptions,
  );
  assert.match(seeded.stdout, /"persisted":5/);
  const repeated = await execFileAsync(
    process.execPath,
    [...seedArguments, '--apply'],
    seedOptions,
  );
  assert.match(repeated.stdout, /"existing":5/);
  const rows = await database.notification.findMany({
    where: {
      recipientId: fixtureStudentId,
      eventKey: { startsWith: 'demo:student-notification:' },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  assert.equal(rows.length, 5);
  assert.equal(rows.filter(({ readAt }) => readAt === null).length, 3);
  const ids = rows.map(({ id }) => id);
  const firstId = ids[0];
  assert.ok(firstId);

  const feedOperation = `query StudentNotifications($first: Int, $after: String, $unreadOnly: Boolean) {
    myUnreadNotificationCount
    myNotifications(first: $first, after: $after, unreadOnly: $unreadOnly) {
      edges { node { id kind readAt } }
      pageInfo { endCursor hasNextPage }
    }
  }`;
  const firstResponse = await executeGraphql(fixtureToken, feedOperation, {
    first: 3,
  });
  assert.equal(
    Number(firstResponse.myUnreadNotificationCount),
    Number(unreadBefore.myUnreadNotificationCount) + 3,
  );
  const firstPage = requireRecordField(firstResponse, 'myNotifications');
  const firstEdges = requireArrayField(firstPage, 'edges');
  assert.deepEqual(
    firstEdges.map((edge) =>
      String(
        requireRecordField(requireRecord(edge, 'notification edge'), 'node').id,
      ),
    ),
    ids.slice(0, 3),
  );
  const pageInfo = requireRecordField(firstPage, 'pageInfo');
  assert.equal(pageInfo.hasNextPage, true);
  const secondResponse = await executeGraphql(fixtureToken, feedOperation, {
    after: String(pageInfo.endCursor),
    first: 3,
  });
  const secondEdges = requireArrayField(
    requireRecordField(secondResponse, 'myNotifications'),
    'edges',
  );
  assert.deepEqual(
    secondEdges.map((edge) =>
      String(
        requireRecordField(requireRecord(edge, 'notification edge'), 'node').id,
      ),
    ),
    ids.slice(3),
  );
  const unreadResponse = await executeGraphql(fixtureToken, feedOperation, {
    first: 10,
    unreadOnly: true,
  });
  const unreadEdges = requireArrayField(
    requireRecordField(unreadResponse, 'myNotifications'),
    'edges',
  );
  assert.deepEqual(
    unreadEdges.map((edge) =>
      String(
        requireRecordField(requireRecord(edge, 'notification edge'), 'node').id,
      ),
    ),
    ids.slice(0, 3),
  );

  const forbidden = await executeGraphqlExpectingErrors(
    teacherToken,
    `mutation Read($input: MarkNotificationReadInput!) {
      markNotificationRead(input: $input) { notification { id } }
    }`,
    { input: { notificationId: firstId } },
  );
  assert.ok('errors' in forbidden);
  const otherStudentForbidden = await executeGraphqlExpectingErrors(
    studentToken,
    `mutation Read($input: MarkNotificationReadInput!) {
      markNotificationRead(input: $input) { notification { id } }
    }`,
    { input: { notificationId: firstId } },
  );
  assert.ok('errors' in otherStudentForbidden);
  await executeGraphql(
    fixtureToken,
    `mutation Read($input: MarkNotificationReadInput!) {
      markNotificationRead(input: $input) { notification { id readAt } }
    }`,
    { input: { notificationId: firstId } },
  );
  assert.notEqual(
    (await database.notification.findUnique({ where: { id: firstId } }))
      ?.readAt,
    null,
  );
  await executeGraphql(
    fixtureToken,
    `mutation { markAllNotificationsRead { updatedCount } }`,
  );
  assert.equal(
    await database.notification.count({
      where: { id: { in: ids }, readAt: null },
    }),
    0,
  );
  const finalCount = await executeGraphql(
    fixtureToken,
    `query { myUnreadNotificationCount }`,
  );
  assert.equal(finalCount.myUnreadNotificationCount, 0);
});

void test('Teacher creates a categorized group with persisted schedule and ownership', async () => {
  const suffix = randomUUID().slice(0, 8);
  const name = `Reserved IELTS ${suffix}`;
  const slug = `reserved-ielts-${suffix}`;
  const result = await executeGraphql(
    teacherToken,
    `mutation Create($input: CreateTeacherGroupInput!) {
      createTeacherGroup(input: $input) {
        group { id name category room scheduleDays startsAtMinutes endsAtMinutes teacherId monthlyTuitionUzs }
      }
    }`,
    {
      input: {
        category: 'IELTS',
        endsAtMinutes: 630,
        name,
        monthlyTuitionUzs: '300000',
        room: 'Reserved room 000',
        scheduleDays: [1, 3, 5],
        slug,
        startsAtMinutes: 540,
        timeZone: 'Asia/Tashkent',
      },
    },
  );
  const group = requireRecordField(
    requireRecordField(result, 'createTeacherGroup'),
    'group',
  );
  const database = requireApp().get(DatabaseService);
  const stored = await database.group.findUnique({
    where: { id: String(group.id) },
  });
  assert.equal(group.category, 'IELTS');
  assert.equal(group.monthlyTuitionUzs, '300000');
  const initialRate = await database.groupTuitionRate.findFirst({
    where: { groupId: String(group.id), effectiveTo: null },
  });
  assert.equal(initialRate?.amountUzs, 300000n);
  assert.equal(stored?.category, 'IELTS');
  assert.equal(stored.teacherId, teacherId);
  assert.deepEqual(stored.scheduleDays, [1, 3, 5]);
  assert.equal(stored.startsAtMinutes, 540);
  assert.equal(stored.endsAtMinutes, 630);
  const listed = await executeGraphql(
    teacherToken,
    `query NewlyCreatedGroup {
      teacherGroups(first: 100, status: ACTIVE) {
        edges { node {
          id name category room scheduleDays startsAtMinutes endsAtMinutes activeStudentCount monthlyTuitionUzs
        } }
      }
    }`,
  );
  const listedGroup = requireArrayField(
    requireRecordField(listed, 'teacherGroups'),
    'edges',
  )
    .map((edge) =>
      requireRecordField(requireRecord(edge, 'group edge'), 'node'),
    )
    .find((node) => node.id === group.id);
  assert.ok(
    listedGroup,
    'newly created group must appear in the next active-group API read',
  );
  assert.deepEqual(listedGroup.scheduleDays, [1, 3, 5]);
  assert.equal(listedGroup.name, name);
  assert.equal(listedGroup.category, 'IELTS');
  assert.equal(listedGroup.room, 'Reserved room 000');
  assert.equal(listedGroup.startsAtMinutes, 540);
  assert.equal(listedGroup.endsAtMinutes, 630);
  assert.equal(listedGroup.activeStudentCount, 0);
  assert.equal(listedGroup.monthlyTuitionUzs, '300000');
  const audit = await database.auditLog.findFirst({
    where: { action: 'GROUP_CREATED', targetId: String(group.id) },
  });
  assert.ok(audit);
  assert.equal(
    requireRecord(audit.newValues, 'created group audit').monthlyTuitionUzs,
    '300000',
  );
  const forbidden = await executeGraphqlExpectingErrors(
    studentToken,
    `mutation Create($input: CreateTeacherGroupInput!) {
      createTeacherGroup(input: $input) { group { id } }
    }`,
    {
      input: {
        category: 'CEFR',
        endsAtMinutes: 630,
        name,
        room: 'Reserved room 000',
        scheduleDays: [1],
        slug: `${slug}-student`,
        startsAtMinutes: 540,
      },
    },
  );
  assert.ok(requireArrayField(forbidden, 'errors').length > 0);
  const invalidPriceSlug = `${slug}-invalid-price`;
  const invalidPrice = await executeGraphqlExpectingErrors(
    teacherToken,
    `mutation InvalidGroupPrice($input: CreateTeacherGroupInput!) {
      createTeacherGroup(input: $input) { group { id } }
    }`,
    {
      input: {
        category: 'IELTS',
        endsAtMinutes: 630,
        monthlyTuitionUzs: '-1',
        name: `${name} invalid price`,
        room: 'Reserved room 000',
        scheduleDays: [1],
        slug: invalidPriceSlug,
        startsAtMinutes: 540,
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(invalidPrice, 'errors')[0],
        'price error',
      ),
      'extensions',
    ).code,
    'BAD_USER_INPUT',
  );
  assert.equal(
    await database.group.count({ where: { slug: invalidPriceSlug } }),
    0,
  );
  await database.group.update({
    where: { id: String(group.id) },
    data: { archivedAt: new Date(), status: ContentStatus.ARCHIVED },
  });
});

void test('Teacher group create and update reject overlapping active schedules', async () => {
  const database = requireApp().get(DatabaseService);
  const suffix = randomUUID().slice(0, 8);
  const createMutation = `mutation CreateScheduleGroup($input: CreateTeacherGroupInput!) {
    createTeacherGroup(input: $input) { group { id } }
  }`;
  const primarySlug = `reserved-schedule-primary-${suffix}`;
  const primaryResult = await executeGraphql(teacherToken, createMutation, {
    input: {
      category: 'IELTS',
      endsAtMinutes: 840,
      name: `Reserved schedule primary ${suffix}`,
      room: 'Reserved room 010',
      scheduleDays: [1, 3, 5],
      slug: primarySlug,
      startsAtMinutes: 780,
      timeZone: 'Asia/Tashkent',
    },
  });
  const primary = requireRecordField(
    requireRecordField(primaryResult, 'createTeacherGroup'),
    'group',
  );

  const conflictingSlug = `reserved-schedule-conflict-${suffix}`;
  const conflictingCreate = await executeGraphqlExpectingErrors(
    teacherToken,
    createMutation,
    {
      input: {
        category: 'CEFR',
        endsAtMinutes: 870,
        name: `Reserved schedule conflict ${suffix}`,
        room: 'Reserved room 011',
        scheduleDays: [3],
        slug: conflictingSlug,
        startsAtMinutes: 810,
        timeZone: 'Asia/Tashkent',
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(conflictingCreate, 'errors')[0],
        'create schedule conflict',
      ),
      'extensions',
    ).code,
    'CONFLICT',
  );
  assert.equal(
    await database.group.count({ where: { slug: conflictingSlug } }),
    0,
  );

  const adjacentSlug = `reserved-schedule-adjacent-${suffix}`;
  const adjacentResult = await executeGraphql(teacherToken, createMutation, {
    input: {
      category: 'GENERAL_ENGLISH',
      endsAtMinutes: 900,
      name: `Reserved schedule adjacent ${suffix}`,
      room: 'Reserved room 012',
      scheduleDays: [1],
      slug: adjacentSlug,
      startsAtMinutes: 840,
      timeZone: 'Asia/Tashkent',
    },
  });
  const adjacent = requireRecordField(
    requireRecordField(adjacentResult, 'createTeacherGroup'),
    'group',
  );

  const updateConflict = await executeGraphqlExpectingErrors(
    teacherToken,
    `mutation UpdateScheduleGroup($input: UpdateTeacherGroupInput!) {
      updateTeacherGroup(input: $input) { group { id } }
    }`,
    {
      input: {
        category: 'GENERAL_ENGLISH',
        endsAtMinutes: 850,
        groupId: adjacent.id,
        name: `Reserved schedule adjacent ${suffix}`,
        room: 'Reserved room 012',
        scheduleDays: [5],
        slug: adjacentSlug,
        startsAtMinutes: 830,
        timeZone: 'Asia/Tashkent',
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(updateConflict, 'errors')[0],
        'update schedule conflict',
      ),
      'extensions',
    ).code,
    'CONFLICT',
  );
  const unchangedAdjacent = await database.group.findUniqueOrThrow({
    where: { id: String(adjacent.id) },
  });
  assert.deepEqual(unchangedAdjacent.scheduleDays, [1]);
  assert.equal(unchangedAdjacent.startsAtMinutes, 840);
  assert.equal(unchangedAdjacent.endsAtMinutes, 900);

  await database.group.update({
    where: { id: String(adjacent.id) },
    data: {
      archivedAt: new Date(),
      endsAtMinutes: 870,
      scheduleDays: [3],
      startsAtMinutes: 810,
      status: ContentStatus.ARCHIVED,
    },
  });
  const restoreConflict = await executeGraphqlExpectingErrors(
    teacherToken,
    `mutation RestoreScheduleGroup($input: SetTeacherGroupArchivedInput!) {
      setTeacherGroupArchived(input: $input) { group { id status } }
    }`,
    {
      input: {
        archived: false,
        groupId: adjacent.id,
        reason: 'Reserved overlapping schedule restore check',
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(restoreConflict, 'errors')[0],
        'restore schedule conflict',
      ),
      'extensions',
    ).code,
    'CONFLICT',
  );
  assert.equal(
    (
      await database.group.findUniqueOrThrow({
        where: { id: String(adjacent.id) },
      })
    ).status,
    ContentStatus.ARCHIVED,
  );

  await database.group.updateMany({
    where: { id: { in: [String(primary.id), String(adjacent.id)] } },
    data: { archivedAt: new Date(), status: ContentStatus.ARCHIVED },
  });
});

void test('Teacher updates an owned group with persisted values and audit history', async () => {
  const suffix = randomUUID().slice(0, 8);
  const slug = `reserved-update-${suffix}`;
  const created = await executeGraphql(
    teacherToken,
    `mutation CreateForUpdate($input: CreateTeacherGroupInput!) {
      createTeacherGroup(input: $input) { group { id } }
    }`,
    {
      input: {
        category: 'IELTS',
        endsAtMinutes: 600,
        name: `Reserved update source ${suffix}`,
        room: 'Reserved room 000',
        scheduleDays: [1, 3, 5],
        slug,
        startsAtMinutes: 480,
        timeZone: 'Asia/Tashkent',
      },
    },
  );
  const group = requireRecordField(
    requireRecordField(created, 'createTeacherGroup'),
    'group',
  );
  const updatedName = `Reserved update target ${suffix}`;
  const updated = await executeGraphql(
    teacherToken,
    `mutation Update($input: UpdateTeacherGroupInput!) {
      updateTeacherGroup(input: $input) {
        group {
          id name slug category room scheduleDays startsAtMinutes endsAtMinutes monthlyTuitionUzs
        }
      }
    }`,
    {
      input: {
        category: 'CEFR',
        endsAtMinutes: 750,
        groupId: group.id,
        name: updatedName,
        monthlyTuitionUzs: '350000',
        room: 'Reserved room 001',
        scheduleDays: [2, 4, 6],
        slug,
        startsAtMinutes: 630,
        timeZone: 'Asia/Tashkent',
      },
    },
  );
  const updatedGroup = requireRecordField(
    requireRecordField(updated, 'updateTeacherGroup'),
    'group',
  );
  assert.equal(updatedGroup.id, group.id);
  assert.equal(updatedGroup.name, updatedName);
  assert.equal(updatedGroup.slug, slug);
  assert.equal(updatedGroup.category, 'CEFR');
  assert.equal(updatedGroup.room, 'Reserved room 001');
  assert.deepEqual(updatedGroup.scheduleDays, [2, 4, 6]);
  assert.equal(updatedGroup.startsAtMinutes, 630);
  assert.equal(updatedGroup.endsAtMinutes, 750);
  assert.equal(updatedGroup.monthlyTuitionUzs, '350000');

  const database = requireApp().get(DatabaseService);
  const stored = await database.group.findUnique({
    where: { id: String(group.id) },
  });
  assert.ok(stored);
  assert.equal(stored.name, updatedName);
  assert.equal(stored.category, 'CEFR');
  assert.equal(stored.room, 'Reserved room 001');
  assert.deepEqual(stored.scheduleDays, [2, 4, 6]);
  assert.equal(stored.startsAtMinutes, 630);
  assert.equal(stored.endsAtMinutes, 750);
  const editedRate = await database.groupTuitionRate.findFirst({
    where: { groupId: String(group.id), effectiveTo: null },
  });
  assert.equal(editedRate?.amountUzs, 350000n);

  const audit = await database.auditLog.findFirst({
    where: { action: 'GROUP_UPDATED', targetId: String(group.id) },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(audit);
  assert.equal(
    requireRecord(audit.newValues, 'updated group audit').monthlyTuitionUzs,
    '350000',
  );
  assert.equal(
    requireRecord(audit.oldValues, 'old group audit').category,
    'IELTS',
  );
  assert.equal(
    requireRecord(audit.newValues, 'new group audit').category,
    'CEFR',
  );

  const detail = await executeGraphql(
    teacherToken,
    `query UpdatedGroup($groupId: ID!) {
      teacherGroup(groupId: $groupId) { id name category room scheduleDays }
    }`,
    { groupId: group.id },
  );
  assert.equal(requireRecordField(detail, 'teacherGroup').name, updatedName);

  const otherTeacherId = randomUUID();
  await database.user.create({
    data: {
      displayName: `Reserved Other Teacher ${suffix}`,
      id: otherTeacherId,
      role: UserRole.TEACHER,
    },
  });
  const otherTeacherToken = await requireApp()
    .get(AuthService)
    .issueAccessToken({ id: otherTeacherId, role: UserRole.TEACHER });
  const forbidden = await executeGraphqlExpectingErrors(
    otherTeacherToken,
    `mutation UpdateOtherTeacherGroup($input: UpdateTeacherGroupInput!) {
      updateTeacherGroup(input: $input) { group { id } }
    }`,
    {
      input: {
        category: 'IELTS',
        endsAtMinutes: 600,
        groupId: group.id,
        name: `Reserved forbidden update ${suffix}`,
        room: 'Reserved room 002',
        scheduleDays: [1],
        slug,
        startsAtMinutes: 540,
        timeZone: 'Asia/Tashkent',
      },
    },
  );
  const ownershipError = requireRecord(
    requireArrayField(forbidden, 'errors')[0],
    'group ownership error',
  );
  assert.equal(
    requireRecordField(ownershipError, 'extensions').code,
    'NOT_FOUND',
  );
  await database.group.update({
    where: { id: String(group.id) },
    data: { archivedAt: new Date(), status: ContentStatus.ARCHIVED },
  });
});

void test('Teacher soft-deletes an empty owned group while retaining its row and audit', async () => {
  const suffix = randomUUID().slice(0, 8);
  const created = await executeGraphql(
    teacherToken,
    `mutation Create($input: CreateTeacherGroupInput!) {
      createTeacherGroup(input: $input) { group { id } }
    }`,
    {
      input: {
        category: 'IELTS',
        endsAtMinutes: 600,
        name: `Reserved soft delete ${suffix}`,
        room: 'Reserved room 000',
        scheduleDays: [1, 3, 5],
        slug: `reserved-soft-delete-${suffix}`,
        startsAtMinutes: 540,
      },
    },
  );
  const group = requireRecordField(
    requireRecordField(created, 'createTeacherGroup'),
    'group',
  );
  const deleted = await executeGraphql(
    teacherToken,
    `mutation Delete($groupId: ID!) {
      deleteTeacherGroup(groupId: $groupId) { group { id status } }
    }`,
    { groupId: group.id },
  );
  const deletedGroup = requireRecordField(
    requireRecordField(deleted, 'deleteTeacherGroup'),
    'group',
  );
  assert.equal(deletedGroup.status, 'DELETED');
  const database = requireApp().get(DatabaseService);
  assert.equal(
    (await database.group.findUnique({ where: { id: String(group.id) } }))
      ?.status,
    'DELETED',
  );
  assert.equal(
    await database.auditLog.count({
      where: { action: 'GROUP_DELETED', targetId: String(group.id) },
    }),
    1,
  );
  const hidden = await executeGraphqlExpectingErrors(
    teacherToken,
    `query Hidden($groupId: ID!) { teacherGroup(groupId: $groupId) { id } }`,
    { groupId: group.id },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(hidden, 'errors')[0],
        'hidden group error',
      ),
      'extensions',
    ).code,
    'NOT_FOUND',
  );
  const active = await executeGraphql(
    teacherToken,
    `query Active { teacherGroups(first: 100, status: ACTIVE) { edges { node { id } } } }`,
  );
  const activeGroups = requireRecordField(active, 'teacherGroups');
  assert.equal(
    requireArrayField(activeGroups, 'edges').some(
      (edge) =>
        requireRecordField(requireRecord(edge, 'group edge'), 'node').id ===
        group.id,
    ),
    false,
  );
  const retained = await executeGraphql(
    adminToken,
    `query Retained($groupId: ID!) { adminGroup(groupId: $groupId) { id status } }`,
    { groupId: group.id },
  );
  assert.equal(requireRecordField(retained, 'adminGroup').status, 'DELETED');
  await executeGraphql(
    teacherToken,
    `mutation DeleteAgain($groupId: ID!) {
      deleteTeacherGroup(groupId: $groupId) { group { status } }
    }`,
    { groupId: group.id },
  );
  assert.equal(
    await database.auditLog.count({
      where: { action: 'GROUP_DELETED', targetId: String(group.id) },
    }),
    1,
  );
  const blocked = await executeGraphqlExpectingErrors(
    teacherToken,
    `mutation DeleteOccupied($groupId: ID!) {
      deleteTeacherGroup(groupId: $groupId) { group { id } }
    }`,
    { groupId },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(blocked, 'errors')[0],
        'occupied group error',
      ),
      'extensions',
    ).code,
    'CONFLICT',
  );
});

void test('Teacher group rejects a sixteenth active learner', async () => {
  const database = requireApp().get(DatabaseService);
  const suffix = randomUUID().slice(0, 8);
  const group = await database.group.create({
    data: {
      category: 'IELTS',
      name: `Reserved capacity ${suffix}`,
      slug: `reserved-capacity-${suffix}`,
      teacherId,
    },
  });
  const studentIds = Array.from({ length: 16 }, () => randomUUID());
  await database.user.createMany({
    data: studentIds.map((id, index) => ({
      displayName: `Fictional capacity learner ${String(index + 1)}`,
      id,
      role: UserRole.STUDENT,
    })),
  });
  await database.groupMembership.createMany({
    data: studentIds.slice(0, 14).map((studentId) => ({
      groupId: group.id,
      studentId,
    })),
  });
  const mutation = `mutation Add($input: AddStudentToGroupInput!) {
    addStudentToGroup(input: $input) { membership { membershipId } }
  }`;
  const fifteenth = await executeGraphql(teacherToken, mutation, {
    input: { groupId: group.id, studentId: studentIds[14] },
  });
  assert.ok(requireRecordField(fifteenth, 'addStudentToGroup'));
  const sixteenth = await executeGraphqlExpectingErrors(
    teacherToken,
    mutation,
    {
      input: { groupId: group.id, studentId: studentIds[15] },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(sixteenth, 'errors')[0],
        'capacity error',
      ),
      'extensions',
    ).code,
    'CONFLICT',
  );
  assert.equal(
    await database.groupMembership.count({
      where: { endedAt: null, groupId: group.id },
    }),
    15,
  );
});

void test('Teacher creates a credential Student directly in an owned group', async () => {
  const database = requireApp().get(DatabaseService);
  const suffix = randomUUID().slice(0, 8);
  const group = await database.group.create({
    data: {
      category: 'IELTS',
      name: `Reserved student enrollment ${suffix}`,
      slug: `reserved-student-enrollment-${suffix}`,
      teacherId,
    },
  });
  const email = `teacher-student-${suffix}@example.com`;
  const password = 'fictional-password-2026';
  const mutation = `mutation CreateStudent($input: TeacherCreateStudentInGroupInput!) {
    teacherCreateStudentInGroup(input: $input) {
      membership { membershipId studentId displayName phone rosterStatus }
    }
  }`;
  const input = {
    email,
    firstName: 'Fictional',
    groupId: group.id,
    lastName: 'Student',
    password,
    phone: '+998901234567',
  };
  const created = await executeGraphql(teacherToken, mutation, { input });
  const membership = requireRecordField(
    requireRecordField(created, 'teacherCreateStudentInGroup'),
    'membership',
  );
  const studentId = requireStringField(membership, 'studentId');
  assert.equal(membership.displayName, 'Fictional Student');
  assert.equal(membership.rosterStatus, 'ACTIVE');
  const student = await database.user.findUniqueOrThrow({
    where: { id: studentId },
  });
  assert.equal(student.email, email);
  assert.equal(student.phone, '+998901234567');
  assert.equal(student.role, UserRole.STUDENT);
  assert.match(student.credentialPasswordHash ?? '', /^\$argon2id\$/);
  assert.notEqual(student.credentialPasswordHash, password);
  assert.equal(
    await database.groupMembership.count({
      where: { groupId: group.id, studentId },
    }),
    1,
  );
  assert.equal(
    await database.auditLog.count({
      where: {
        action: 'TEACHER_STUDENT_CREATED_AND_ENROLLED',
        actorId: teacherId,
      },
    }),
    1,
  );

  const duplicate = await executeGraphqlExpectingErrors(
    teacherToken,
    mutation,
    { input },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(duplicate, 'errors')[0],
        'duplicate error',
      ),
      'extensions',
    ).code,
    'CONFLICT',
  );
  const denied = await executeGraphqlExpectingErrors(adminToken, mutation, {
    input: { ...input, email: `denied-${suffix}@example.com` },
  });
  assert.equal(
    requireRecordField(
      requireRecord(requireArrayField(denied, 'errors')[0], 'role error'),
      'extensions',
    ).code,
    'FORBIDDEN',
  );
  const otherTeacher = await database.user.create({
    data: { displayName: 'Reserved Other Teacher', role: UserRole.TEACHER },
  });
  const otherGroup = await database.group.create({
    data: {
      category: 'CEFR',
      name: `Reserved other group ${suffix}`,
      slug: `reserved-other-group-${suffix}`,
      teacherId: otherTeacher.id,
    },
  });
  const inaccessibleEmail = `inaccessible-${suffix}@example.com`;
  const inaccessible = await executeGraphqlExpectingErrors(
    teacherToken,
    mutation,
    {
      input: { ...input, email: inaccessibleEmail, groupId: otherGroup.id },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(inaccessible, 'errors')[0],
        'ownership error',
      ),
      'extensions',
    ).code,
    'NOT_FOUND',
  );
  assert.equal(
    await database.user.count({ where: { email: inaccessibleEmail } }),
    0,
  );
});

void test('Teacher soft-deletes only an owned Student and preserves their records', async () => {
  const database = requireApp().get(DatabaseService);
  const suffix = randomUUID().slice(0, 8);
  const group = await database.group.create({
    data: {
      category: 'IELTS',
      name: `Reserved soft delete ${suffix}`,
      slug: `reserved-soft-delete-${suffix}`,
      teacherId,
    },
  });
  const student = await database.user.create({
    data: {
      displayName: 'Fictional Delete Student',
      email: `soft-delete-${suffix}@example.com`,
      role: UserRole.STUDENT,
    },
  });
  const membership = await database.groupMembership.create({
    data: { groupId: group.id, studentId: student.id },
  });
  const mutation = `mutation DeleteStudent($input: TeacherDeleteStudentInput!) {
    teacherDeleteStudent(input: $input) {
      membership { membershipId studentId status endedAt }
    }
  }`;
  const input = { membershipId: membership.id };

  const denied = await executeGraphqlExpectingErrors(adminToken, mutation, {
    input,
  });
  assert.ok(requireArrayField(denied, 'errors').length > 0);
  const otherTeacher = await database.user.create({
    data: { displayName: 'Fictional Other Teacher', role: UserRole.TEACHER },
  });
  const otherTeacherToken = await requireApp()
    .get(AuthService)
    .issueAccessToken({ id: otherTeacher.id, role: UserRole.TEACHER });
  const notOwned = await executeGraphqlExpectingErrors(
    otherTeacherToken,
    mutation,
    { input },
  );
  assert.equal(
    requireRecordField(
      requireRecord(requireArrayField(notOwned, 'errors')[0], 'owner error'),
      'extensions',
    ).code,
    'NOT_FOUND',
  );
  assert.equal(
    (await database.user.findUniqueOrThrow({ where: { id: student.id } }))
      .status,
    'ACTIVE',
  );

  const deleted = await executeGraphql(teacherToken, mutation, { input });
  const result = requireRecordField(
    requireRecordField(deleted, 'teacherDeleteStudent'),
    'membership',
  );
  assert.equal(result.studentId, student.id);
  assert.equal(result.status, 'DELETED');
  assert.ok(result.endedAt);
  assert.equal(
    (await database.user.findUniqueOrThrow({ where: { id: student.id } }))
      .status,
    'DELETED',
  );
  assert.ok(
    (
      await database.groupMembership.findUniqueOrThrow({
        where: { id: membership.id },
      })
    ).endedAt,
  );
  assert.equal(
    await database.auditLog.count({
      where: {
        action: 'TEACHER_STUDENT_SOFT_DELETED',
        actorId: teacherId,
        targetId: student.id,
      },
    }),
    1,
  );

  const roster = await executeGraphql(
    teacherToken,
    `query DeletedStudentRoster($groupId: ID!) {
      teacherGroupRoster(groupId: $groupId, first: 20, includeEnded: true) {
        edges { node { studentId } }
      }
      teacherGroupRosterSummary(groupId: $groupId) { currentTotal historicalTotal }
    }`,
    { groupId: group.id },
  );
  assert.deepEqual(requireRecordField(roster, 'teacherGroupRosterSummary'), {
    currentTotal: 0,
    historicalTotal: 0,
  });
  assert.equal(
    requireArrayField(requireRecordField(roster, 'teacherGroupRoster'), 'edges')
      .length,
    0,
  );
  const repeated = await executeGraphqlExpectingErrors(teacherToken, mutation, {
    input,
  });
  assert.ok(requireArrayField(repeated, 'errors').length > 0);
});

void test('Admin soft-deletes a Student and hides the retained account from Admin and Teacher lists', async () => {
  const database = requireApp().get(DatabaseService);
  const suffix = randomUUID().slice(0, 8);
  const group = await database.group.create({
    data: {
      category: 'CEFR',
      name: `Reserved admin delete ${suffix}`,
      slug: `reserved-admin-delete-${suffix}`,
      teacherId,
    },
  });
  const student = await database.user.create({
    data: {
      displayName: 'Fictional Admin Delete Student',
      email: `admin-delete-${suffix}@example.com`,
      role: UserRole.STUDENT,
    },
  });
  await database.groupMembership.create({
    data: { groupId: group.id, studentId: student.id },
  });
  const mutation = `mutation AdminDeleteStudent($input: AdminDeleteStudentInput!) {
    adminDeleteStudent(input: $input) { user { id role status } }
  }`;

  const denied = await executeGraphqlExpectingErrors(teacherToken, mutation, {
    input: { studentId: student.id },
  });
  assert.ok(requireArrayField(denied, 'errors').length > 0);

  const deleted = await executeGraphql(adminToken, mutation, {
    input: { studentId: student.id },
  });
  const deletedUser = requireRecordField(
    requireRecordField(deleted, 'adminDeleteStudent'),
    'user',
  );
  assert.equal(deletedUser.id, student.id);
  assert.equal(deletedUser.role, 'STUDENT');
  assert.equal(deletedUser.status, 'DELETED');
  assert.equal(
    (await database.user.findUniqueOrThrow({ where: { id: student.id } }))
      .status,
    UserStatus.DELETED,
  );
  assert.equal(
    await database.auditLog.count({
      where: {
        action: 'ADMIN_STUDENT_SOFT_DELETED',
        actorId: adminId,
        targetId: student.id,
      },
    }),
    1,
  );

  const adminDirectory = await executeGraphql(
    adminToken,
    `query ActiveAdminStudents {
      adminUsers(first: 100, role: STUDENT) { edges { node { id } } }
    }`,
  );
  assert.equal(
    requireArrayField(
      requireRecordField(adminDirectory, 'adminUsers'),
      'edges',
    ).some(
      (edge) =>
        requireRecordField(requireRecord(edge, 'admin student edge'), 'node')
          .id === student.id,
    ),
    false,
  );

  const roster = await executeGraphql(
    teacherToken,
    `query AdminDeletedStudentRoster($groupId: ID!) {
      teacherGroupRoster(groupId: $groupId, first: 20, includeEnded: true) {
        edges { node { studentId } }
      }
    }`,
    { groupId: group.id },
  );
  assert.equal(
    requireArrayField(
      requireRecordField(roster, 'teacherGroupRoster'),
      'edges',
    ).some(
      (edge) =>
        requireRecordField(requireRecord(edge, 'teacher roster edge'), 'node')
          .studentId === student.id,
    ),
    false,
  );

  const repeated = await executeGraphqlExpectingErrors(adminToken, mutation, {
    input: { studentId: student.id },
  });
  assert.equal(
    requireRecordField(
      requireRecord(requireArrayField(repeated, 'errors')[0], 'repeat error'),
      'extensions',
    ).code,
    'NOT_FOUND',
  );
});

void test('Admin soft-deletes a Teacher and hides the retained account from the Admin directory', async () => {
  const database = requireApp().get(DatabaseService);
  const suffix = randomUUID().slice(0, 8);
  const teacher = await database.user.create({
    data: {
      displayName: 'Fictional Admin Delete Teacher',
      email: `admin-delete-teacher-${suffix}@example.com`,
      role: UserRole.TEACHER,
    },
  });
  const mutation = `mutation AdminDeleteTeacher($input: AdminDeleteTeacherInput!) {
    adminDeleteTeacher(input: $input) { user { id role status } }
  }`;

  const denied = await executeGraphqlExpectingErrors(studentToken, mutation, {
    input: { teacherId: teacher.id },
  });
  assert.ok(requireArrayField(denied, 'errors').length > 0);

  const deleted = await executeGraphql(adminToken, mutation, {
    input: { teacherId: teacher.id },
  });
  const deletedUser = requireRecordField(
    requireRecordField(deleted, 'adminDeleteTeacher'),
    'user',
  );
  assert.equal(deletedUser.id, teacher.id);
  assert.equal(deletedUser.role, 'TEACHER');
  assert.equal(deletedUser.status, 'DELETED');
  assert.equal(
    (await database.user.findUniqueOrThrow({ where: { id: teacher.id } }))
      .status,
    UserStatus.DELETED,
  );
  assert.equal(
    await database.auditLog.count({
      where: {
        action: 'ADMIN_TEACHER_SOFT_DELETED',
        actorId: adminId,
        targetId: teacher.id,
      },
    }),
    1,
  );

  const adminDirectory = await executeGraphql(
    adminToken,
    `query ActiveAdminTeachers {
      adminUsers(first: 100, role: TEACHER) { edges { node { id } } }
    }`,
  );
  assert.equal(
    requireArrayField(
      requireRecordField(adminDirectory, 'adminUsers'),
      'edges',
    ).some(
      (edge) =>
        requireRecordField(requireRecord(edge, 'admin teacher edge'), 'node')
          .id === teacher.id,
    ),
    false,
  );

  const repeated = await executeGraphqlExpectingErrors(adminToken, mutation, {
    input: { teacherId: teacher.id },
  });
  assert.equal(
    requireRecordField(
      requireRecord(requireArrayField(repeated, 'errors')[0], 'repeat error'),
      'extensions',
    ).code,
    'NOT_FOUND',
  );
});

void test('Teacher group roster exposes persisted status summary, overview, and pause', async () => {
  const database = requireApp().get(DatabaseService);
  const suffix = randomUUID().slice(0, 8);
  const rosterGroup = await database.group.create({
    data: {
      category: 'IELTS',
      name: `Reserved roster ${suffix}`,
      slug: `reserved-roster-${suffix}`,
      teacherId,
    },
  });
  const studentIds = Array.from({ length: 12 }, () => randomUUID());
  await database.user.createMany({
    data: studentIds.map((id, index) => ({
      displayName: `Fictional Learner ${String(index + 1)} Surname`,
      email: `fictional-roster-${suffix}-${String(index + 1)}@example.com`,
      id,
      role: UserRole.STUDENT,
    })),
  });
  const departedAt = new Date(Date.now() - 86_400_000);
  const startedAt = new Date(Date.now() - 30 * 86_400_000);
  await database.groupMembership.createMany({
    data: studentIds.map((studentId, index) => ({
      endedAt: index === 11 ? departedAt : null,
      groupId: rosterGroup.id,
      participationStatus:
        index === 8
          ? GroupMembershipStatus.PAUSED
          : GroupMembershipStatus.ACTIVE,
      startedAt,
      studentId,
    })),
  });
  const memberships = await database.groupMembership.findMany({
    where: { groupId: rosterGroup.id },
    select: { id: true, studentId: true },
  });
  const membershipByStudentId = new Map(
    memberships.map((membership) => [membership.studentId, membership.id]),
  );
  const dueDate = new Date(Date.now() - 86_400_000);
  const billingMonth = new Date(
    Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 1),
  );
  await database.tuitionCharge.createMany({
    data: studentIds.slice(9, 11).map((studentId) => ({
      amountUzs: 1_000_000n,
      billingMonth,
      dueDate,
      groupMembershipId: requireDefined(
        membershipByStudentId.get(studentId),
        'debtor membership',
      ),
      studentId,
    })),
  });
  const now = new Date();
  const monthParts = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
  }).formatToParts(now);
  const currentMonth = new Date(
    Date.UTC(
      Number(monthParts.find((part) => part.type === 'year')?.value),
      Number(monthParts.find((part) => part.type === 'month')?.value) - 1,
      1,
    ),
  );
  const payingStudentId = requireDefined(studentIds[0], 'paying student');
  const currentCharge = await database.tuitionCharge.create({
    data: {
      amountUzs: 300000n,
      billingMonth: currentMonth,
      dueDate: new Date(
        Date.UTC(
          currentMonth.getUTCFullYear(),
          currentMonth.getUTCMonth() + 1,
          0,
        ),
      ),
      groupMembershipId: requireDefined(
        membershipByStudentId.get(payingStudentId),
        'paying membership',
      ),
      studentId: payingStudentId,
    },
  });
  const payment = await database.payment.create({
    data: {
      amountUzs: 100000n,
      method: 'CASH',
      paidAt: now,
      recordedById: teacherId,
      studentId: payingStudentId,
    },
  });
  await database.paymentAllocation.create({
    data: {
      amountUzs: 100000n,
      chargeId: currentCharge.id,
      paymentId: payment.id,
    },
  });

  await database.assignment.create({
    data: {
      createdById: teacherId,
      groupId: rosterGroup.id,
      publishedAt: new Date(),
      status: AssignmentStatus.PUBLISHED,
    },
  });
  const testCategory = await database.testCategory.create({
    data: { name: `Reserved roster test ${suffix}`, teacherId },
  });
  const scheduledTest = await database.test.create({
    data: { categoryId: testCategory.id, groupId: rosterGroup.id },
  });
  await database.testVersion.create({
    data: {
      primaryLanguage: Language.EN,
      publishedAt: new Date(),
      status: TestVersionStatus.PUBLISHED,
      testId: scheduledTest.id,
      version: 1,
    },
  });
  const libraryCategory = await database.libraryCategory.create({
    data: { name: `Reserved roster material ${suffix}`, teacherId },
  });
  const libraryItem = await database.libraryItem.create({
    data: {
      categoryId: libraryCategory.id,
      ownerTeacherId: teacherId,
      primaryLanguage: Language.EN,
      visibility: LibraryVisibility.ALL_GROUPS,
    },
  });
  await database.lessonMaterial.create({
    data: {
      createdById: teacherId,
      groupId: rosterGroup.id,
      libraryItemId: libraryItem.id,
    },
  });

  const detail = await executeGraphql(
    teacherToken,
    `query TeacherGroupRosterDetail($groupId: ID!) {
      teacherGroupRosterSummary(groupId: $groupId) {
        currentTotal historicalTotal active paused debtors departed
      }
      teacherGroupOverview(groupId: $groupId) {
        activeAssignmentCount scheduledTestCount materialCount currentStudentCount
      }
      teacherGroupRoster(groupId: $groupId, first: 50, includeEnded: true) {
        edges { node {
          membershipId studentId displayName rosterStatus outstandingBalanceUzs paidAmountUzs endedAt
          recentPayments { id amountUzs paidAt }
        } }
      }
    }`,
    { groupId: rosterGroup.id },
  );
  assert.deepEqual(requireRecordField(detail, 'teacherGroupRosterSummary'), {
    active: 8,
    currentTotal: 11,
    debtors: 2,
    departed: 1,
    historicalTotal: 12,
    paused: 1,
  });
  assert.deepEqual(requireRecordField(detail, 'teacherGroupOverview'), {
    activeAssignmentCount: 1,
    currentStudentCount: 11,
    materialCount: 1,
    scheduledTestCount: 1,
  });
  const rosterNodes = requireArrayField(
    requireRecordField(detail, 'teacherGroupRoster'),
    'edges',
  ).map((edge) =>
    requireRecordField(requireRecord(edge, 'roster edge'), 'node'),
  );
  assert.equal(rosterNodes.length, 12);
  const payingRosterNode = rosterNodes.find(
    (node) => node.studentId === payingStudentId,
  );
  assert.equal(payingRosterNode?.paidAmountUzs, '100000');
  const recentPayments = requireArrayField(
    requireDefined(payingRosterNode, 'paying roster node'),
    'recentPayments',
  );
  assert.equal(recentPayments.length, 1);
  assert.equal(
    requireRecord(recentPayments[0], 'recent payment').amountUzs,
    '100000',
  );
  assert.equal(
    rosterNodes.filter((node) => node.rosterStatus === 'DEBTOR').length,
    2,
  );
  assert.equal(
    rosterNodes.filter((node) => node.rosterStatus === 'DEPARTED').length,
    1,
  );
  assert.ok(
    rosterNodes
      .filter((node) => node.rosterStatus === 'DEBTOR')
      .every((node) => node.outstandingBalanceUzs === '1000000'),
  );

  const debtorStudentId = requireDefined(studentIds[9], 'debtor student');
  const debtorCharge = await database.tuitionCharge.findFirstOrThrow({
    where: { studentId: debtorStudentId },
  });
  const settledPayment = await database.payment.create({
    data: {
      amountUzs: 1000000n,
      method: 'CASH',
      paidAt: new Date(),
      recordedById: teacherId,
      studentId: debtorStudentId,
    },
  });
  await database.paymentAllocation.create({
    data: {
      amountUzs: 1000000n,
      chargeId: debtorCharge.id,
      paymentId: settledPayment.id,
    },
  });
  const settledRoster = await executeGraphql(
    teacherToken,
    `query SettledRoster($groupId: ID!) {
      teacherGroupRosterSummary(groupId: $groupId) { active debtors }
      teacherGroupRoster(groupId: $groupId, first: 50) {
        edges { node { studentId rosterStatus outstandingBalanceUzs } }
      }
    }`,
    { groupId: rosterGroup.id },
  );
  const settledSummary = requireRecordField(
    settledRoster,
    'teacherGroupRosterSummary',
  );
  assert.equal(settledSummary.debtors, 1);
  assert.equal(settledSummary.active, 9);
  const settledMember = requireArrayField(
    requireRecordField(settledRoster, 'teacherGroupRoster'),
    'edges',
  )
    .map((edge) =>
      requireRecordField(requireRecord(edge, 'settled edge'), 'node'),
    )
    .find((member) => member.studentId === debtorStudentId);
  assert.ok(settledMember);
  assert.equal(settledMember.rosterStatus, 'ACTIVE');
  assert.equal(settledMember.outstandingBalanceUzs, '0');

  const pausedStudentId = requireDefined(studentIds[0], 'paused student id');
  const pausedMembershipId = requireDefined(
    membershipByStudentId.get(pausedStudentId),
    'paused membership id',
  );
  const paused = await executeGraphql(
    teacherToken,
    `mutation PauseRosterMember($input: SetGroupMembershipParticipationStatusInput!) {
      setGroupMembershipParticipationStatus(input: $input) {
        membership { membershipId rosterStatus }
      }
    }`,
    {
      input: {
        membershipId: pausedMembershipId,
        reason: 'Reserved temporary participation pause',
        status: 'PAUSED',
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecordField(paused, 'setGroupMembershipParticipationStatus'),
      'membership',
    ).rosterStatus,
    'PAUSED',
  );
  assert.equal(
    (
      await database.groupMembership.findUnique({
        where: { id: pausedMembershipId },
      })
    )?.participationStatus,
    GroupMembershipStatus.PAUSED,
  );
  assert.equal(
    await database.auditLog.count({
      where: {
        action: 'GROUP_MEMBERSHIP_PARTICIPATION_STATUS_SET',
        targetId: pausedMembershipId,
      },
    }),
    1,
  );

  const otherTeacherId = randomUUID();
  await database.user.create({
    data: {
      displayName: `Reserved roster other teacher ${suffix}`,
      id: otherTeacherId,
      role: UserRole.TEACHER,
    },
  });
  const otherTeacherToken = await requireApp()
    .get(AuthService)
    .issueAccessToken({ id: otherTeacherId, role: UserRole.TEACHER });
  const ownershipFailure = await executeGraphqlExpectingErrors(
    otherTeacherToken,
    `mutation ResumeOtherRosterMember($input: SetGroupMembershipParticipationStatusInput!) {
      setGroupMembershipParticipationStatus(input: $input) {
        membership { membershipId }
      }
    }`,
    {
      input: {
        membershipId: pausedMembershipId,
        reason: 'Reserved unauthorized participation change',
        status: 'ACTIVE',
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(ownershipFailure, 'errors')[0],
        'membership ownership error',
      ),
      'extensions',
    ).code,
    'NOT_FOUND',
  );
});

void test('Admin provisions a credential user who completes email-code login', async () => {
  const database = requireApp().get(DatabaseService);
  const enrollmentGroup = await database.group.create({
    data: {
      category: GroupCategory.IELTS,
      name: `Reserved Admin Enrollment ${randomUUID()}`,
      slug: `reserved-admin-enrollment-${randomUUID()}`,
      status: ContentStatus.ACTIVE,
      teacherId,
    },
    select: { id: true },
  });
  const email = `credential-${randomUUID()}@example.com`;
  const displayName = 'Reserved Credential Student';
  const password = 'reserved-password-2026';
  const provisioned = await executeGraphql(
    adminToken,
    `mutation ProvisionCredentialUser($input: AdminProvisionUserInput!) {
      adminProvisionUser(input: $input) {
        user { id displayName email role status }
      }
    }`,
    {
      input: {
        displayName,
        email,
        groupId: enrollmentGroup.id,
        password,
        role: 'STUDENT',
      },
    },
  );
  const user = requireRecordField(
    requireRecordField(provisioned, 'adminProvisionUser'),
    'user',
  );
  const userId = requireStringField(user, 'id');
  assert.equal(user.role, 'STUDENT');

  const storedUser = await database.user.findUnique({
    where: { id: userId },
    select: { credentialPasswordHash: true },
  });
  assert.match(storedUser?.credentialPasswordHash ?? '', /^\$argon2id\$/);
  assert.notEqual(storedUser?.credentialPasswordHash, password);
  const storedMembership = await database.groupMembership.findFirst({
    where: {
      endedAt: null,
      groupId: enrollmentGroup.id,
      studentId: userId,
    },
    select: { id: true },
  });
  assert.ok(storedMembership);

  const deniedProvision = await executeGraphqlExpectingErrors(
    studentToken,
    `mutation DeniedProvision($input: AdminProvisionUserInput!) {
      adminProvisionUser(input: $input) { user { id } }
    }`,
    {
      input: {
        displayName: 'Denied User',
        email: `denied-${randomUUID()}@example.com`,
        password,
        role: 'TEACHER',
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(deniedProvision, 'errors')[0],
        'denied error',
      ),
      'extensions',
    ).code,
    'FORBIDDEN',
  );

  credentialEmailSender.clear();
  const roleMismatch = await executeGraphqlExpectingErrors(
    undefined,
    `mutation RejectRoleMismatch($input: BeginCredentialLoginInput!) {
      beginCredentialLogin(input: $input) { challengeId }
    }`,
    {
      input: {
        email,
        expectedRole: 'TEACHER',
        name: displayName,
        password,
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(roleMismatch, 'errors')[0],
        'role mismatch error',
      ),
      'extensions',
    ).code,
    'UNAUTHENTICATED',
  );
  assert.equal(credentialEmailSender.getLatestMessage(), undefined);

  for (const [input, expectedCode] of [
    [
      {
        email: `missing-${randomUUID()}@example.com`,
        expectedRole: 'STUDENT',
        name: displayName,
        password,
      },
      'LOGIN_EMAIL_INVALID',
    ],
    [
      {
        email,
        expectedRole: 'STUDENT',
        name: displayName,
        password: 'incorrect-password-2026',
      },
      'LOGIN_PASSWORD_INVALID',
    ],
    [
      {
        email,
        expectedRole: 'STUDENT',
        firstName: 'Incorrect',
        lastName: 'Credential Student',
        name: 'Incorrect Credential Student',
        password,
      },
      'LOGIN_FIRST_NAME_INVALID',
    ],
    [
      {
        email,
        expectedRole: 'STUDENT',
        firstName: 'Reserved',
        lastName: 'Incorrect Student',
        name: 'Reserved Incorrect Student',
        password,
      },
      'LOGIN_LAST_NAME_INVALID',
    ],
    [
      {
        email,
        expectedRole: 'STUDENT',
        firstName: 'Reserved',
        lastName: '',
        name: 'Reserved',
        password,
      },
      'LOGIN_LAST_NAME_INVALID',
    ],
  ] as const) {
    const rejected = await executeGraphqlExpectingErrors(
      undefined,
      `mutation RejectInvalidLoginField($input: BeginCredentialLoginInput!) {
        beginCredentialLogin(input: $input) { challengeId }
      }`,
      { input },
    );
    assert.equal(
      requireRecordField(
        requireRecord(
          requireArrayField(rejected, 'errors')[0],
          'login field error',
        ),
        'extensions',
      ).code,
      expectedCode,
    );
    assert.equal(credentialEmailSender.getLatestMessage(), undefined);
  }

  const challengeResponse = await executeGraphql(
    undefined,
    `mutation BeginLogin($input: BeginCredentialLoginInput!) {
      beginCredentialLogin(input: $input) {
        challengeId maskedEmail expiresAt resendAvailableAt
      }
    }`,
    {
      input: {
        email: email.toUpperCase(),
        expectedRole: 'STUDENT',
        firstName: 'Reserved',
        lastName: 'Credential Student',
        name: displayName,
        password,
      },
    },
  );
  const challenge = requireRecordField(
    challengeResponse,
    'beginCredentialLogin',
  );
  const challengeId = requireStringField(challenge, 'challengeId');
  assert.match(requireStringField(challenge, 'maskedEmail'), /\*{3,}@/);
  const firstMessage = credentialEmailSender.getLatestMessage();
  if (firstMessage === undefined) {
    throw new Error('Credential email was not captured');
  }
  assert.equal(firstMessage.to, email);
  const firstCode = firstMessage.code;

  const earlyResend = await executeGraphqlExpectingErrors(
    undefined,
    `mutation EarlyResend($input: ResendCredentialLoginCodeInput!) {
      resendCredentialLoginCode(input: $input) { challengeId }
    }`,
    { input: { challengeId } },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(earlyResend, 'errors')[0],
        'resend error',
      ),
      'extensions',
    ).code,
    'RATE_LIMITED',
  );
  await requireApp()
    .get(DatabaseService)
    .credentialLoginChallenge.update({
      where: { id: challengeId },
      data: { resendAvailableAt: new Date(Date.now() - 1_000) },
    });
  await executeGraphql(
    undefined,
    `mutation Resend($input: ResendCredentialLoginCodeInput!) {
      resendCredentialLoginCode(input: $input) {
        challengeId expiresAt resendAvailableAt
      }
    }`,
    { input: { challengeId } },
  );
  const resentMessage = credentialEmailSender.getLatestMessage();
  if (resentMessage === undefined) {
    throw new Error('Resent credential email was not captured');
  }
  const code = resentMessage.code;

  const wrongCode = await executeGraphqlExpectingErrors(
    undefined,
    `mutation VerifyWrongCode($input: VerifyCredentialLoginInput!) {
      verifyCredentialLogin(input: $input) { accessToken }
    }`,
    { input: { challengeId, code: firstCode } },
  );
  assert.equal(
    requireRecordField(
      requireRecord(requireArrayField(wrongCode, 'errors')[0], 'wrong code'),
      'extensions',
    ).code,
    'LOGIN_CODE_INVALID',
  );

  const verified = await executeGraphql(
    undefined,
    `mutation VerifyLogin($input: VerifyCredentialLoginInput!) {
      verifyCredentialLogin(input: $input) {
        accessToken expiresInSeconds refreshToken refreshExpiresAt
        user { id displayName role }
      }
    }`,
    { input: { challengeId, code } },
  );
  const login = requireRecordField(verified, 'verifyCredentialLogin');
  assert.equal(requireRecordField(login, 'user').id, userId);
  const loginToken = requireStringField(login, 'accessToken');
  const refreshToken = requireStringField(login, 'refreshToken');
  assert.match(refreshToken, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.ok(
    Date.parse(requireStringField(login, 'refreshExpiresAt')) > Date.now(),
  );

  const refreshTokenId = refreshToken.slice(0, refreshToken.indexOf('.'));
  const storedRefreshToken = await requireApp()
    .get(DatabaseService)
    .credentialRefreshToken.findUnique({
      where: { id: refreshTokenId },
      select: { tokenHash: true },
    });
  assert.match(storedRefreshToken?.tokenHash ?? '', /^[0-9a-f]{64}$/);
  assert.notEqual(storedRefreshToken?.tokenHash, refreshToken);

  const viewer = await executeGraphql(
    loginToken,
    `query CredentialViewer { viewer { id displayName role } }`,
  );
  assert.equal(requireRecordField(viewer, 'viewer').id, userId);

  const refreshed = await executeGraphql(
    undefined,
    `mutation RefreshSession($input: RefreshCredentialSessionInput!) {
      refreshCredentialSession(input: $input) {
        accessToken expiresInSeconds refreshToken refreshExpiresAt
        user { id role }
      }
    }`,
    { input: { refreshToken } },
  );
  const refreshedSession = requireRecordField(
    refreshed,
    'refreshCredentialSession',
  );
  const rotatedRefreshToken = requireStringField(
    refreshedSession,
    'refreshToken',
  );
  assert.notEqual(rotatedRefreshToken, refreshToken);
  assert.equal(requireRecordField(refreshedSession, 'user').id, userId);
  const refreshedViewer = await executeGraphql(
    requireStringField(refreshedSession, 'accessToken'),
    `query RefreshedCredentialViewer { viewer { id } }`,
  );
  assert.equal(requireRecordField(refreshedViewer, 'viewer').id, userId);

  const reusedRefresh = await executeGraphqlExpectingErrors(
    undefined,
    `mutation ReuseRefreshSession($input: RefreshCredentialSessionInput!) {
      refreshCredentialSession(input: $input) { accessToken }
    }`,
    { input: { refreshToken } },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(reusedRefresh, 'errors')[0],
        'refresh reuse error',
      ),
      'extensions',
    ).code,
    'UNAUTHENTICATED',
  );
  const revokedRotation = await executeGraphqlExpectingErrors(
    undefined,
    `mutation RefreshRevokedSession($input: RefreshCredentialSessionInput!) {
      refreshCredentialSession(input: $input) { accessToken }
    }`,
    { input: { refreshToken: rotatedRefreshToken } },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(revokedRotation, 'errors')[0],
        'revoked refresh error',
      ),
      'extensions',
    ).code,
    'UNAUTHENTICATED',
  );
  assert.equal(
    await requireApp()
      .get(DatabaseService)
      .auditLog.count({
        where: {
          action: 'AUTH_REFRESH_TOKEN_REUSED',
          actorId: userId,
        },
      }),
    1,
  );

  const malformedRevoke = await executeGraphql(
    undefined,
    `mutation RevokeMalformedSession($input: RevokeCredentialSessionInput!) {
      revokeCredentialSession(input: $input)
    }`,
    { input: { refreshToken: 'invalid' } },
  );
  assert.equal(malformedRevoke.revokeCredentialSession, true);

  const reused = await executeGraphqlExpectingErrors(
    undefined,
    `mutation ReuseCode($input: VerifyCredentialLoginInput!) {
      verifyCredentialLogin(input: $input) { accessToken }
    }`,
    { input: { challengeId, code } },
  );
  assert.equal(
    requireRecordField(
      requireRecord(requireArrayField(reused, 'errors')[0], 'reuse error'),
      'extensions',
    ).code,
    'LOGIN_CODE_INVALID',
  );
});

void test('Teacher with a legacy given-name profile can use the split login form', async () => {
  const email = `legacy-teacher-${randomUUID()}@example.com`;
  const password = 'reserved-teacher-password-2026';
  await executeGraphql(
    adminToken,
    `mutation ProvisionLegacyTeacher($input: AdminProvisionUserInput!) {
      adminProvisionUser(input: $input) { user { id } }
    }`,
    { input: { displayName: 'Ada', email, password, role: 'TEACHER' } },
  );

  credentialEmailSender.clear();
  const challengeResponse = await executeGraphql(
    undefined,
    `mutation BeginLegacyTeacherLogin($input: BeginCredentialLoginInput!) {
      beginCredentialLogin(input: $input) { challengeId }
    }`,
    {
      input: {
        email,
        expectedRole: 'TEACHER',
        firstName: 'Ada',
        lastName: 'Lovelace',
        name: 'Ada Lovelace',
        password,
      },
    },
  );
  const challengeId = requireStringField(
    requireRecordField(challengeResponse, 'beginCredentialLogin'),
    'challengeId',
  );
  const code = credentialEmailSender.getLatestMessage()?.code;
  if (code === undefined) throw new Error('Credential email was not captured');

  const verified = await executeGraphql(
    undefined,
    `mutation VerifyLegacyTeacherLogin($input: VerifyCredentialLoginInput!) {
      verifyCredentialLogin(input: $input) {
        accessToken refreshToken user { displayName }
      }
    }`,
    { input: { challengeId, code } },
  );
  const login = requireRecordField(verified, 'verifyCredentialLogin');
  assert.equal(requireRecordField(login, 'user').displayName, 'Ada');

  const accessToken = requireStringField(login, 'accessToken');
  const refreshToken = requireStringField(login, 'refreshToken');
  await executeGraphql(
    accessToken,
    `mutation CompleteTeacherName($input: UpdateMyProfileInput!) {
      updateMyProfile(input: $input) { profile { displayName } }
    }`,
    { input: { displayName: 'Ada Lovelace', preferredLanguage: 'UZ' } },
  );
  const revoked = await executeGraphql(
    undefined,
    `mutation RevokeTeacherSession($input: RevokeCredentialSessionInput!) {
      revokeCredentialSession(input: $input)
    }`,
    { input: { refreshToken } },
  );
  assert.equal(revoked.revokeCredentialSession, true);
  const refreshAfterLogout = await executeGraphqlExpectingErrors(
    undefined,
    `mutation RefreshAfterTeacherLogout($input: RefreshCredentialSessionInput!) {
      refreshCredentialSession(input: $input) { accessToken }
    }`,
    { input: { refreshToken } },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(refreshAfterLogout, 'errors')[0],
        'refresh after logout error',
      ),
      'extensions',
    ).code,
    'UNAUTHENTICATED',
  );
  const wrongSurname = await executeGraphqlExpectingErrors(
    undefined,
    `mutation WrongTeacherSurname($input: BeginCredentialLoginInput!) {
      beginCredentialLogin(input: $input) { challengeId }
    }`,
    {
      input: {
        email,
        expectedRole: 'TEACHER',
        firstName: 'Ada',
        lastName: 'Wrong',
        name: 'Ada Wrong',
        password,
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(wrongSurname, 'errors')[0],
        'wrong surname',
      ),
      'extensions',
    ).code,
    'LOGIN_LAST_NAME_INVALID',
  );
  await executeGraphql(
    undefined,
    `mutation BeginCompleteTeacherLogin($input: BeginCredentialLoginInput!) {
      beginCredentialLogin(input: $input) { challengeId }
    }`,
    {
      input: { email, expectedRole: 'TEACHER', name: 'Ada Lovelace', password },
    },
  );
});

after(async () => {
  if (app !== undefined) {
    await app.close();
  }

  await adminPool.query(
    `SELECT pg_terminate_backend("pid")
     FROM "pg_stat_activity"
     WHERE "datname" = $1
       AND "pid" <> pg_backend_pid()`,
    [databaseName],
  );
  await adminPool.query(`DROP DATABASE "${databaseName}"`);
  await adminPool.end();
  await closeServer(fakeStorageServer);
  await closeServer(fakeMalwareScannerServer);
  restoreRuntimeEnvironment(originalRuntimeEnvironment);

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

void test('Student can list, start, save, submit, and poll an attempt', async () => {
  const viewer = await executeGraphql(
    studentToken,
    `query Viewer { viewer { id displayName role } }`,
  );
  assert.equal(requireRecordField(viewer, 'viewer').role, 'STUDENT');

  const availableTests = await executeGraphql(
    studentToken,
    `query AvailableTests($language: Language!) {
      studentAvailableTests(language: $language) {
        edges { node { id title attemptsUsed activeAttemptId } }
        pageInfo { hasNextPage }
      }
    }`,
    { language: 'UZ' },
  );
  const connection = requireRecordField(
    availableTests,
    'studentAvailableTests',
  );
  const edges = requireArrayField(connection, 'edges');
  assert.equal(edges.length, 1);
  assert.equal(
    requireRecordField(requireRecord(edges[0], 'edge'), 'node').id,
    testId,
  );

  const unavailableTranslation = await executeGraphqlExpectingErrors(
    studentToken,
    `mutation StartUnavailableTranslation($input: StartTestAttemptInput!) {
      startTestAttempt(input: $input) { attempt { id } }
    }`,
    { input: { language: 'RU', testId } },
  );
  const translationError = requireRecord(
    requireArrayField(unavailableTranslation, 'errors')[0],
    'translation error',
  );
  assert.equal(
    requireRecordField(translationError, 'extensions').code,
    'TRANSLATION_NOT_AVAILABLE',
  );
  assert.equal(
    await requireApp()
      .get(DatabaseService)
      .attempt.count({ where: { studentId } }),
    0,
  );

  const started = await executeGraphql(
    studentToken,
    `mutation StartAttempt($input: StartTestAttemptInput!) {
      startTestAttempt(input: $input) {
        attempt {
          id status title
          sections {
            id
            blocks {
              kind
              caption
              tableRows { cells }
              questionIds
            }
          }
          questions { id prompt options { id text } }
          answers { questionId selectedOptionId }
        }
      }
    }`,
    { input: { language: 'UZ', testId } },
  );
  const startedAttempt = requireRecordField(
    requireRecordField(started, 'startTestAttempt'),
    'attempt',
  );
  const attemptId = requireStringField(startedAttempt, 'id');

  const mediaDownload = await executeGraphql(
    studentToken,
    `query AttemptMedia($attemptId: ID!, $mediaObjectId: ID!) {
      studentAttemptMediaDownload(
        attemptId: $attemptId
        mediaObjectId: $mediaObjectId
      ) { url expiresAt }
    }`,
    { attemptId, mediaObjectId: attemptMediaObjectId },
  );
  const mediaIntent = requireRecordField(
    mediaDownload,
    'studentAttemptMediaDownload',
  );
  assert.match(
    requireStringField(mediaIntent, 'url'),
    /^http:\/\/127\.0\.0\.1:/,
  );
  assert.ok(
    Date.parse(requireStringField(mediaIntent, 'expiresAt')) > Date.now(),
  );

  const unrelatedMedia = await executeGraphqlExpectingErrors(
    studentToken,
    `query AttemptMedia($attemptId: ID!, $mediaObjectId: ID!) {
      studentAttemptMediaDownload(
        attemptId: $attemptId
        mediaObjectId: $mediaObjectId
      ) { url }
    }`,
    { attemptId, mediaObjectId: randomUUID() },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(unrelatedMedia, 'errors')[0],
        'unrelated media error',
      ),
      'extensions',
    ).code,
    'NOT_FOUND',
  );
  const question = requireRecord(
    requireArrayField(startedAttempt, 'questions')[0],
    'question',
  );
  const option = requireRecord(
    requireArrayField(question, 'options')[0],
    'option',
  );
  const section = requireRecord(
    requireArrayField(startedAttempt, 'sections')[0],
    'section',
  );
  const tableBlock = requireRecord(
    requireArrayField(section, 'blocks')[0],
    'safe student table block',
  );
  assert.equal(tableBlock.kind, 'TABLE');
  assert.equal(tableBlock.caption, 'Reserved phone interview');
  assert.deepEqual(
    requireRecord(
      requireArrayField(tableBlock, 'tableRows')[0],
      'safe student table row',
    ).cells,
    ['Name', 'Reserved learner'],
  );
  assert.deepEqual(tableBlock.questionIds, []);

  const savedNote = await executeGraphql(
    studentToken,
    `mutation SaveNote(
      $input: SaveAttemptSectionNoteInput!
      $language: Language!
    ) {
      saveAttemptSectionNote(input: $input, language: $language) {
        attempt { notes { sectionId text } }
      }
    }`,
    {
      input: {
        attemptId,
        sectionId: requireStringField(section, 'id'),
        text: 'Reserved private working note',
      },
      language: 'UZ',
    },
  );
  assert.equal(
    requireRecord(
      requireArrayField(
        requireRecordField(
          requireRecordField(savedNote, 'saveAttemptSectionNote'),
          'attempt',
        ),
        'notes',
      )[0],
      'saved note',
    ).text,
    'Reserved private working note',
  );

  const saved = await executeGraphql(
    studentToken,
    `mutation SaveAnswer(
      $input: SaveAttemptAnswerInput!
      $language: Language!
    ) {
      saveAttemptAnswer(input: $input, language: $language) {
        attempt { id status answers { questionId selectedOptionId } }
      }
    }`,
    {
      input: {
        attemptId,
        questionId: requireStringField(question, 'id'),
        selectedOptionId: requireStringField(option, 'id'),
      },
      language: 'UZ',
    },
  );
  const savedAttempt = requireRecordField(
    requireRecordField(saved, 'saveAttemptAnswer'),
    'attempt',
  );
  assert.equal(requireArrayField(savedAttempt, 'answers').length, 1);

  const submitted = await executeGraphql(
    studentToken,
    `mutation SubmitAttempt(
      $input: SubmitTestAttemptInput!
      $language: Language!
    ) {
      submitTestAttempt(input: $input, language: $language) {
        attempt { id status }
      }
    }`,
    { input: { attemptId }, language: 'UZ' },
  );
  const submittedAttempt = requireRecordField(
    requireRecordField(submitted, 'submitTestAttempt'),
    'attempt',
  );
  assert.equal(submittedAttempt.status, 'SUBMITTED');

  await executeGraphql(
    studentToken,
    `mutation RepeatSubmit(
      $input: SubmitTestAttemptInput!
      $language: Language!
    ) {
      submitTestAttempt(input: $input, language: $language) {
        attempt { id status }
      }
    }`,
    { input: { attemptId }, language: 'UZ' },
  );

  const outboxCount = await requireApp()
    .get(DatabaseService)
    .outboxEvent.count({
      where: { aggregateId: attemptId },
    });
  assert.equal(outboxCount, 1);
});

void test('Student progress uses current-group completion and best score per test', async () => {
  const database = requireApp().get(DatabaseService);
  const authService = requireApp().get(AuthService);
  const fixture = await createStudentProgressFixture(database, teacherId);
  const progressToken = await authService.issueAccessToken({
    id: fixture.studentId,
    role: UserRole.STUDENT,
  });
  const response = await executeGraphql(
    progressToken,
    `query StudentProgress {
      studentProgress {
        groupId
        groupName
        assignedTestCount
        completedTestCount
        remainingTestCount
        awaitingScoreTestCount
        scoredTestCount
        passedTestCount
        failedTestCount
        completionPercentage
        averagePercentage
        highestPercentage
        latestActivityAt
      }
    }`,
  );
  const progress = requireRecordField(response, 'studentProgress');

  assert.equal(progress.groupId, fixture.groupId);
  assert.equal(progress.groupName, fixture.groupName);
  assert.equal(progress.assignedTestCount, 4);
  assert.equal(progress.completedTestCount, 3);
  assert.equal(progress.remainingTestCount, 1);
  assert.equal(progress.awaitingScoreTestCount, 1);
  assert.equal(progress.scoredTestCount, 2);
  assert.equal(progress.passedTestCount, 1);
  assert.equal(progress.failedTestCount, 1);
  assert.equal(progress.completionPercentage, 75);
  assert.equal(progress.averagePercentage, 65);
  assert.equal(progress.highestPercentage, 80);
  assert.equal(typeof progress.latestActivityAt, 'string');

  const noMembershipStudentId = randomUUID();
  await database.user.create({
    data: {
      displayName: 'Student without progress group',
      id: noMembershipStudentId,
      role: UserRole.STUDENT,
    },
  });
  const noMembershipToken = await authService.issueAccessToken({
    id: noMembershipStudentId,
    role: UserRole.STUDENT,
  });
  const emptyResponse = await executeGraphql(
    noMembershipToken,
    `query EmptyStudentProgress {
      studentProgress {
        groupId assignedTestCount completedTestCount completionPercentage
      }
    }`,
  );
  const emptyProgress = requireRecordField(emptyResponse, 'studentProgress');
  assert.equal(emptyProgress.groupId, null);
  assert.equal(emptyProgress.assignedTestCount, 0);
  assert.equal(emptyProgress.completedTestCount, 0);
  assert.equal(emptyProgress.completionPercentage, 0);
});

void test('Teacher can inspect owned-group progress, attempts, and answers', async () => {
  const database = requireApp().get(DatabaseService);
  const authService = requireApp().get(AuthService);
  const fixture = await createStudentProgressFixture(database, teacherId);

  const groupResponse = await executeGraphql(
    teacherToken,
    `query TeacherGroupProgress($groupId: ID!) {
      teacherGroupProgress(groupId: $groupId) {
        groupId groupName activeStudentCount assignedTestCount
        totalAssignmentCount completedAssignmentCount remainingAssignmentCount
        awaitingScoreAssignmentCount scoredAssignmentCount
        passedAssignmentCount failedAssignmentCount completionPercentage
        averagePercentage highestPercentage lowestPercentage
      }
    }`,
    { groupId: fixture.groupId },
  );
  const groupProgress = requireRecordField(
    groupResponse,
    'teacherGroupProgress',
  );
  assert.equal(groupProgress.groupId, fixture.groupId);
  assert.equal(groupProgress.activeStudentCount, 1);
  assert.equal(groupProgress.assignedTestCount, 4);
  assert.equal(groupProgress.totalAssignmentCount, 4);
  assert.equal(groupProgress.completedAssignmentCount, 3);
  assert.equal(groupProgress.remainingAssignmentCount, 1);
  assert.equal(groupProgress.awaitingScoreAssignmentCount, 1);
  assert.equal(groupProgress.scoredAssignmentCount, 2);
  assert.equal(groupProgress.passedAssignmentCount, 1);
  assert.equal(groupProgress.failedAssignmentCount, 1);
  assert.equal(groupProgress.completionPercentage, 75);
  assert.equal(groupProgress.averagePercentage, 65);
  assert.equal(groupProgress.highestPercentage, 80);
  assert.equal(groupProgress.lowestPercentage, 50);

  const studentsResponse = await executeGraphql(
    teacherToken,
    `query TeacherGroupStudents($groupId: ID!) {
      teacherGroupStudents(groupId: $groupId) {
        edges {
          node {
            studentId displayName assignedTestCount completedTestCount
            remainingTestCount awaitingScoreTestCount scoredTestCount
            passedTestCount failedTestCount completionPercentage
            averagePercentage highestPercentage lowestPercentage latestActivityAt
          }
        }
        pageInfo { hasNextPage }
      }
    }`,
    { groupId: fixture.groupId },
  );
  const studentEdges = requireArrayField(
    requireRecordField(studentsResponse, 'teacherGroupStudents'),
    'edges',
  );
  assert.equal(studentEdges.length, 1);
  const studentProgress = requireRecordField(
    requireRecord(studentEdges[0], 'student progress edge'),
    'node',
  );
  assert.equal(studentProgress.studentId, fixture.studentId);
  assert.equal(studentProgress.displayName, 'Progress Student');
  assert.equal(studentProgress.completedTestCount, 3);
  assert.equal(studentProgress.averagePercentage, 65);
  assert.equal(studentProgress.lowestPercentage, 50);

  const testsResponse = await executeGraphql(
    teacherToken,
    `query TeacherStudentTests(
      $groupId: ID!
      $studentId: ID!
      $language: Language!
    ) {
      teacherStudentTests(
        groupId: $groupId
        studentId: $studentId
        language: $language
      ) {
        edges { node { testId title status attemptCount highestPercentage } }
      }
    }`,
    {
      groupId: fixture.groupId,
      language: 'UZ',
      studentId: fixture.studentId,
    },
  );
  const testEdges = requireArrayField(
    requireRecordField(testsResponse, 'teacherStudentTests'),
    'edges',
  );
  assert.equal(testEdges.length, 4);
  const statusByTitle = new Map(
    testEdges.map((edge) => {
      const node = requireRecordField(
        requireRecord(edge, 'test progress edge'),
        'node',
      );
      return [node.title, node.status];
    }),
  );
  assert.equal(statusByTitle.get('Passed test'), 'PASSED');
  assert.equal(statusByTitle.get('Awaiting test'), 'AWAITING_SCORE');
  assert.equal(statusByTitle.get('Remaining test'), 'NOT_STARTED');
  assert.equal(statusByTitle.get('Failed test'), 'FAILED');
  assert.equal(statusByTitle.has('Future test'), false);

  const attemptsResponse = await executeGraphql(
    teacherToken,
    `query TeacherStudentAttempts(
      $groupId: ID!
      $studentId: ID!
      $language: Language!
    ) {
      teacherStudentAttempts(
        groupId: $groupId
        studentId: $studentId
        language: $language
      ) {
        edges {
          node {
            attemptId testId title attemptNumber status startedAt
            submittedAt percentage passed
          }
        }
      }
    }`,
    {
      groupId: fixture.groupId,
      language: 'UZ',
      studentId: fixture.studentId,
    },
  );
  const attemptEdges = requireArrayField(
    requireRecordField(attemptsResponse, 'teacherStudentAttempts'),
    'edges',
  );
  assert.equal(attemptEdges.length, 4);
  assert.equal(
    attemptEdges.some((edge) => {
      const node = requireRecordField(
        requireRecord(edge, 'attempt edge'),
        'node',
      );
      return node.attemptId === fixture.reviewAttemptId;
    }),
    true,
  );

  const reviewResponse = await executeGraphql(
    teacherToken,
    `query TeacherAttemptReview($attemptId: ID!, $language: Language!) {
      teacherAttemptReview(attemptId: $attemptId, language: $language) {
        attemptId studentId studentDisplayName testId title status percentage
        answers {
          questionId position prompt selectedOptionId selectedOptionText
          correctOptionId correctOptionText isCorrect
        }
      }
    }`,
    { attemptId: fixture.reviewAttemptId, language: 'UZ' },
  );
  const review = requireRecordField(reviewResponse, 'teacherAttemptReview');
  assert.equal(review.attemptId, fixture.reviewAttemptId);
  assert.equal(review.studentId, fixture.studentId);
  assert.equal(review.studentDisplayName, 'Progress Student');
  assert.equal(review.status, 'SCORED');
  assert.equal(review.percentage, 80);
  const answer = requireRecord(
    requireArrayField(review, 'answers')[0],
    'answer review',
  );
  assert.equal(answer.selectedOptionId, answer.correctOptionId);
  assert.equal(answer.selectedOptionText, 'Correct');
  assert.equal(answer.correctOptionText, 'Correct');
  assert.equal(answer.isCorrect, true);

  const otherTeacherId = randomUUID();
  await database.user.create({
    data: {
      displayName: 'Other Teacher',
      id: otherTeacherId,
      role: UserRole.TEACHER,
    },
  });
  const otherTeacherToken = await authService.issueAccessToken({
    id: otherTeacherId,
    role: UserRole.TEACHER,
  });
  const hiddenGroup = await executeGraphqlExpectingErrors(
    otherTeacherToken,
    `query HiddenTeacherGroup($groupId: ID!) {
      teacherGroupProgress(groupId: $groupId) { groupId }
    }`,
    { groupId: fixture.groupId },
  );
  const hiddenGroupError = requireRecord(
    requireArrayField(hiddenGroup, 'errors')[0],
    'hidden group error',
  );
  assert.equal(
    requireRecordField(hiddenGroupError, 'extensions').code,
    'NOT_FOUND',
  );
});

void test('Writing review stays private until release and persists an owner-scoped rubric', async () => {
  const database = requireApp().get(DatabaseService);
  const authService = requireApp().get(AuthService);
  const category = await database.testCategory.create({
    data: { name: `Reserved Writing results ${randomUUID()}`, teacherId },
  });
  const paper = await database.testPaper.create({
    data: {
      academicYear: 2026,
      createdById: teacherId,
      groupId,
      practiceNumber: 99,
      slug: `reserved-writing-results-${randomUUID()}`,
      sourceLabel: 'Fictional integration fixture.',
      title: 'Reserved Writing results paper',
    },
  });
  const writingTest = await database.test.create({
    data: {
      categoryId: category.id,
      groupId,
      paperId: paper.id,
      skill: TestSkill.WRITING,
    },
  });
  const version = await database.testVersion.create({
    data: {
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'manual-rubric-v1',
      testId: writingTest.id,
      translations: {
        create: { language: Language.EN, title: 'Reserved Writing result' },
      },
      version: 1,
    },
  });
  const questions: string[] = [];
  for (const position of [1, 2]) {
    const section = await database.testSection.create({
      data: { position, testVersionId: version.id },
    });
    const question = await database.question.create({
      data: {
        kind: QuestionKind.LONG_TEXT,
        position,
        sectionId: section.id,
        testVersionId: version.id,
        translations: {
          create: {
            language: Language.EN,
            prompt: `Reserved Task ${String(position)}`,
          },
        },
      },
    });
    questions.push(question.id);
  }
  const membership = await database.groupMembership.findFirstOrThrow({
    where: { groupId, studentId },
  });
  const attempt = await database.attempt.create({
    data: {
      attemptNumber: 1,
      groupMembershipId: membership.id,
      studentId,
      testVersionId: version.id,
    },
  });
  await database.attemptAnswer.createMany({
    data: questions.map((questionId, index) => ({
      attemptId: attempt.id,
      questionId,
      textValue: `Fictional Writing answer ${String(index + 1)}`,
    })),
  });
  const inProgressHidden = await executeGraphqlExpectingErrors(
    teacherToken,
    `query AttemptSkill($attemptId: ID!) {
      teacherResultAttemptSkill(attemptId: $attemptId)
    }`,
    { attemptId: attempt.id },
  );
  assert.match(JSON.stringify(inProgressHidden.errors), /NOT_FOUND/);
  await database.attempt.update({
    where: { id: attempt.id },
    data: {
      status: AttemptStatus.SUBMITTED,
      submittedAt: new Date(),
      submissionReason: AttemptSubmissionReason.MANUAL,
    },
  });

  const inbox = await executeGraphql(
    teacherToken,
    `query Inbox($groupId: ID!) {
    teacherResultInbox(groupId: $groupId, language: EN, skill: WRITING) {
      pendingReviewCount edges { node { attemptId studentDisplayName status skill } }
    }
  }`,
    { groupId },
  );
  const inboxData = requireRecordField(inbox, 'teacherResultInbox');
  assert.ok(Number(inboxData.pendingReviewCount) >= 1);
  assert.ok(
    requireArrayField(inboxData, 'edges').some(
      (edge) =>
        requireRecordField(requireRecord(edge, 'edge'), 'node').attemptId ===
        attempt.id,
    ),
  );

  const hiddenBeforeRelease = await executeGraphql(
    studentToken,
    `query WritingResult($attemptId: ID!) {
    studentWritingResult(attemptId: $attemptId, language: EN) { practiceBand }
  }`,
    { attemptId: attempt.id },
  );
  assert.equal(hiddenBeforeRelease.studentWritingResult, null);

  const rubric = {
    taskAchievement: 6,
    coherenceCohesion: 6,
    lexicalResource: 6,
    grammaticalRangeAccuracy: 6,
    feedback: 'Fictional Task feedback',
  };
  const saveOperation = `mutation SaveReview($input: SaveWritingAttemptReviewInput!) {
    saveWritingAttemptReview(input: $input, language: EN) {
      status review { practiceBand updatedAt releasedAt }
    }
  }`;
  const draft = await executeGraphql(teacherToken, saveOperation, {
    input: {
      attemptId: attempt.id,
      task1: rubric,
      task2: {
        ...rubric,
        taskAchievement: 7,
        coherenceCohesion: 7,
        lexicalResource: 7,
        grammaticalRangeAccuracy: 7,
      },
      feedback: 'Fictional overall feedback',
      release: false,
    },
  });
  const draftReview = requireRecordField(
    requireRecordField(draft, 'saveWritingAttemptReview'),
    'review',
  );
  assert.equal(draftReview.practiceBand, 6.5);
  assert.equal(draftReview.releasedAt, null);
  assert.equal(
    (
      await database.attemptReview.findUniqueOrThrow({
        where: { attemptId: attempt.id },
      })
    ).rubricVersion,
    'ielts-academic-writing-v1',
  );

  const otherTeacherId = randomUUID();
  await database.user.create({
    data: {
      id: otherTeacherId,
      displayName: 'Reserved Other Teacher',
      role: UserRole.TEACHER,
    },
  });
  const otherToken = await authService.issueAccessToken({
    id: otherTeacherId,
    role: UserRole.TEACHER,
  });
  const denied = await executeGraphqlExpectingErrors(
    otherToken,
    saveOperation,
    {
      input: {
        attemptId: attempt.id,
        task1: rubric,
        task2: rubric,
        release: true,
      },
    },
  );
  assert.match(JSON.stringify(denied.errors), /NOT_FOUND/);

  const released = await executeGraphql(teacherToken, saveOperation, {
    input: {
      attemptId: attempt.id,
      task1: rubric,
      task2: {
        ...rubric,
        taskAchievement: 7,
        coherenceCohesion: 7,
        lexicalResource: 7,
        grammaticalRangeAccuracy: 7,
      },
      expectedUpdatedAt: draftReview.updatedAt,
      feedback: 'Fictional overall feedback',
      release: true,
    },
  });
  assert.equal(
    requireRecordField(released, 'saveWritingAttemptReview').status,
    'SCORED',
  );
  const visible = await executeGraphql(
    studentToken,
    `query WritingResult($attemptId: ID!) {
    studentWritingResult(attemptId: $attemptId, language: EN) {
      practiceBand feedback answers { textValue }
    }
  }`,
    { attemptId: attempt.id },
  );
  const studentResult = requireRecordField(visible, 'studentWritingResult');
  assert.equal(studentResult.practiceBand, 6.5);
  assert.equal(studentResult.feedback, 'Fictional overall feedback');
  assert.equal(requireArrayField(studentResult, 'answers').length, 2);
  const otherStudentId = randomUUID();
  await database.user.create({
    data: {
      id: otherStudentId,
      displayName: 'Reserved Other Student',
      role: UserRole.STUDENT,
    },
  });
  const otherStudentToken = await authService.issueAccessToken({
    id: otherStudentId,
    role: UserRole.STUDENT,
  });
  const hiddenFromOtherStudent = await executeGraphql(
    otherStudentToken,
    `query WritingResult($attemptId: ID!) {
      studentWritingResult(attemptId: $attemptId, language: EN) { practiceBand }
    }`,
    { attemptId: attempt.id },
  );
  assert.equal(hiddenFromOtherStudent.studentWritingResult, null);

  const readingTest = await database.test.create({
    data: {
      categoryId: category.id,
      groupId,
      paperId: paper.id,
      skill: TestSkill.READING,
    },
  });
  const readingVersion = await database.testVersion.create({
    data: {
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'single-choice-v1',
      testId: readingTest.id,
      translations: {
        create: { language: Language.EN, title: 'Reserved Reading result' },
      },
      version: 1,
    },
  });
  const readingQuestion = await database.question.create({
    data: {
      kind: QuestionKind.SINGLE_CHOICE,
      position: 1,
      testVersionId: readingVersion.id,
      translations: {
        create: {
          language: Language.EN,
          prompt: 'Reserved objective question?',
        },
      },
    },
  });
  const correctOption = await database.answerOption.create({
    data: {
      isCorrect: true,
      position: 1,
      questionId: readingQuestion.id,
      translations: {
        create: { language: Language.EN, text: 'Reserved correct option' },
      },
    },
  });
  const readingAttempt = await database.attempt.create({
    data: {
      attemptNumber: 1,
      groupMembershipId: membership.id,
      studentId,
      testVersionId: readingVersion.id,
    },
  });
  await database.attemptAnswer.create({
    data: {
      attemptId: readingAttempt.id,
      questionId: readingQuestion.id,
      selectedOptionId: correctOption.id,
    },
  });
  await database.attempt.update({
    where: { id: readingAttempt.id },
    data: {
      status: AttemptStatus.SUBMITTED,
      submissionReason: AttemptSubmissionReason.MANUAL,
      submittedAt: new Date(),
    },
  });
  await database.attempt.update({
    where: { id: readingAttempt.id },
    data: {
      status: AttemptStatus.SCORED,
      correctAnswerCount: 1,
      totalQuestionCount: 1,
      percentage: 100,
      passed: true,
      passingPercentage: 60,
      scoringRuleVersion: 'single-choice-v1',
    },
  });
  const objective = await executeGraphql(
    teacherToken,
    `query Objective($attemptId: ID!) {
    teacherObjectiveAttemptResult(attemptId: $attemptId, language: EN) {
      skill correctAnswerCount answers { studentAnswer correctAnswer isCorrect }
    }
  }`,
    { attemptId: readingAttempt.id },
  );
  const objectiveResult = requireRecordField(
    objective,
    'teacherObjectiveAttemptResult',
  );
  assert.equal(objectiveResult.skill, 'READING');
  assert.equal(objectiveResult.correctAnswerCount, 1);
  assert.equal(
    requireRecord(
      requireArrayField(objectiveResult, 'answers')[0],
      'objective answer',
    ).isCorrect,
    true,
  );
  const hiddenObjective = await executeGraphqlExpectingErrors(
    otherToken,
    `query Objective($attemptId: ID!) {
    teacherObjectiveAttemptResult(attemptId: $attemptId, language: EN) { attemptId }
  }`,
    { attemptId: readingAttempt.id },
  );
  assert.match(JSON.stringify(hiddenObjective.errors), /NOT_FOUND/);

  const speakingTest = await database.test.create({
    data: {
      categoryId: category.id,
      groupId,
      paperId: paper.id,
      skill: TestSkill.SPEAKING,
    },
  });
  const speakingVersion = await database.testVersion.create({
    data: {
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'manual-rubric-v1',
      testId: speakingTest.id,
      translations: {
        create: { language: Language.EN, title: 'Reserved Speaking result' },
      },
      version: 1,
    },
  });
  const speakingSection = await database.testSection.create({
    data: { position: 1, testVersionId: speakingVersion.id },
  });
  await database.question.create({
    data: {
      kind: QuestionKind.AUDIO_RESPONSE,
      position: 1,
      sectionId: speakingSection.id,
      testVersionId: speakingVersion.id,
      translations: {
        create: { language: Language.EN, prompt: 'Fictional speaking prompt' },
      },
    },
  });
  const speakingAttempt = await database.attempt.create({
    data: {
      attemptNumber: 1,
      groupMembershipId: membership.id,
      studentId,
      testVersionId: speakingVersion.id,
    },
  });
  await database.attempt.update({
    where: { id: speakingAttempt.id },
    data: {
      status: AttemptStatus.SUBMITTED,
      submissionReason: AttemptSubmissionReason.MANUAL,
      submittedAt: new Date(),
    },
  });
  const speakingSave = `mutation SaveSpeaking($input: SaveSpeakingAttemptReviewInput!) {
    saveSpeakingAttemptReview(input: $input, language: EN) { status review { practiceBand releasedAt } }
  }`;
  const speakingInput = {
    attemptId: speakingAttempt.id,
    fluencyCoherence: 6,
    lexicalResource: 6,
    grammaticalRangeAccuracy: 6,
    pronunciation: 6,
    practiceBand: 6,
    feedback: 'Fictional speaking feedback',
  };
  const speakingDraft = await executeGraphql(teacherToken, speakingSave, {
    input: { ...speakingInput, release: false },
  });
  assert.equal(
    requireRecordField(speakingDraft, 'saveSpeakingAttemptReview').status,
    'SUBMITTED',
  );
  const speakingRelease = await executeGraphql(teacherToken, speakingSave, {
    input: { ...speakingInput, release: true },
  });
  assert.equal(
    requireRecordField(speakingRelease, 'saveSpeakingAttemptReview').status,
    'SCORED',
  );
  const speakingStudent = await executeGraphql(
    studentToken,
    `query SpeakingResult($attemptId: ID!) {
    studentSpeakingResult(attemptId: $attemptId, language: EN) { practiceBand feedback }
  }`,
    { attemptId: speakingAttempt.id },
  );
  assert.equal(
    requireRecordField(speakingStudent, 'studentSpeakingResult').practiceBand,
    6,
  );
});

void test('Teacher role cannot call Student operations', async () => {
  const response = await executeGraphqlExpectingErrors(
    teacherToken,
    `query TeacherCannotReadStudentProgress {
      studentProgress { assignedTestCount }
    }`,
  );
  const firstError = requireRecord(
    requireArrayField(response, 'errors')[0],
    'error',
  );
  const extensions = requireRecordField(firstError, 'extensions');
  assert.equal(extensions.code, 'FORBIDDEN');
});

void test('Student role cannot call Teacher result operations', async () => {
  const response = await executeGraphqlExpectingErrors(
    studentToken,
    `query StudentCannotReadTeacherProgress($groupId: ID!) {
      teacherGroupProgress(groupId: $groupId) { groupId }
    }`,
    { groupId },
  );
  const firstError = requireRecord(
    requireArrayField(response, 'errors')[0],
    'error',
  );
  assert.equal(requireRecordField(firstError, 'extensions').code, 'FORBIDDEN');
});

void test('Student settings persist profile image, contact details, and password', async () => {
  const database = requireApp().get(DatabaseService);
  const authService = requireApp().get(AuthService);
  const passwordService = new CredentialPasswordService();
  const initialPassword = 'reserved-student-password-2026';
  const updatedPassword = 'updated-student-password-2026';
  const initialEmail = `settings-${randomUUID()}@example.test`;
  const updatedEmail = `settings-updated-${randomUUID()}@example.test`;
  const provisioned = await executeGraphql(
    adminToken,
    `mutation ProvisionSettingsStudent($input: AdminProvisionUserInput!) {
      adminProvisionUser(input: $input) { user { id } }
    }`,
    {
      input: {
        displayName: 'Reserved Settings Student',
        email: initialEmail,
        password: initialPassword,
        role: 'STUDENT',
      },
    },
  );
  const userId = requireStringField(
    requireRecordField(
      requireRecordField(provisioned, 'adminProvisionUser'),
      'user',
    ),
    'id',
  );
  const token = await authService.issueAccessToken({
    id: userId,
    role: UserRole.STUDENT,
  });

  const nonImageUpload = await executeGraphqlExpectingErrors(
    token,
    `mutation RejectStudentDocument($input: CreateMediaUploadIntentInput!) {
      createMediaUploadIntent(input: $input) { uploadIntent { mediaObjectId } }
    }`,
    {
      input: {
        mimeType: 'application/pdf',
        originalName: 'not-a-profile-image.pdf',
        sizeBytes: 10,
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(nonImageUpload, 'errors')[0],
        'upload error',
      ),
      'extensions',
    ).code,
    'FORBIDDEN',
  );

  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
    'base64',
  );
  const created = await executeGraphql(
    token,
    `mutation CreateStudentAvatar($input: CreateMediaUploadIntentInput!) {
      createMediaUploadIntent(input: $input) {
        uploadIntent { mediaObjectId url requiredHeaders { name value } }
      }
    }`,
    {
      input: {
        mimeType: 'image/png',
        originalName: 'reserved-avatar.png',
        sizeBytes: image.byteLength,
      },
    },
  );
  const intent = requireRecordField(
    requireRecordField(created, 'createMediaUploadIntent'),
    'uploadIntent',
  );
  const avatarMediaObjectId = requireStringField(intent, 'mediaObjectId');
  const uploaded = await fetch(requireStringField(intent, 'url'), {
    body: new Uint8Array(image),
    headers: requireUploadHeaders(intent),
    method: 'PUT',
  });
  assert.equal(uploaded.status, 200);
  const confirmed = await executeGraphql(
    token,
    `mutation ConfirmStudentAvatar($input: MediaObjectReferenceInput!) {
      confirmMediaUpload(input: $input) {
        mediaObject { id malwareStatus status }
      }
    }`,
    { input: { mediaObjectId: avatarMediaObjectId } },
  );
  const mediaObject = requireRecordField(
    requireRecordField(confirmed, 'confirmMediaUpload'),
    'mediaObject',
  );
  assert.equal(mediaObject.status, 'READY');
  assert.equal(mediaObject.malwareStatus, 'CLEAN');

  const updated = await executeGraphql(
    token,
    `mutation SaveStudentSettings($input: UpdateMyProfileInput!) {
      updateMyProfile(input: $input) {
        profile { id displayName email phone avatarMediaObjectId }
      }
    }`,
    {
      input: {
        avatarMediaObjectId,
        displayName: 'Mira Example',
        email: updatedEmail,
        phone: '+998900000000',
        preferredLanguage: 'EN',
      },
    },
  );
  const profile = requireRecordField(
    requireRecordField(updated, 'updateMyProfile'),
    'profile',
  );
  assert.equal(profile.id, userId);
  assert.equal(profile.displayName, 'Mira Example');
  assert.equal(profile.email, updatedEmail);
  assert.equal(profile.phone, '+998900000000');
  assert.equal(profile.avatarMediaObjectId, avatarMediaObjectId);
  const persisted = await database.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      avatarMediaObjectId: true,
      credentialPasswordHash: true,
      displayName: true,
      email: true,
      phone: true,
    },
  });
  assert.equal(persisted.avatarMediaObjectId, avatarMediaObjectId);
  assert.equal(persisted.displayName, 'Mira Example');
  assert.equal(persisted.email, updatedEmail);
  assert.equal(persisted.phone, '+998900000000');

  const passwordMutation = `mutation ChangeStudentPassword($input: ChangeMyPasswordInput!) {
    changeMyPassword(input: $input) { changed }
  }`;
  const rejected = await executeGraphqlExpectingErrors(
    token,
    passwordMutation,
    {
      input: {
        confirmPassword: updatedPassword,
        currentPassword: 'wrong-reserved-password',
        newPassword: updatedPassword,
      },
    },
  );
  assert.equal(requireArrayField(rejected, 'errors').length, 1);
  const changed = await executeGraphql(token, passwordMutation, {
    input: {
      confirmPassword: updatedPassword,
      currentPassword: initialPassword,
      newPassword: updatedPassword,
    },
  });
  assert.equal(requireRecordField(changed, 'changeMyPassword').changed, true);
  const storedPassword = await database.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credentialPasswordHash: true },
  });
  assert.notEqual(
    storedPassword.credentialPasswordHash,
    persisted.credentialPasswordHash,
  );
  assert.equal(
    await passwordService.verifyPassword(
      initialPassword,
      storedPassword.credentialPasswordHash,
    ),
    false,
  );
  assert.equal(
    await passwordService.verifyPassword(
      updatedPassword,
      storedPassword.credentialPasswordHash,
    ),
    true,
  );
});

void test('Admin and owning Teacher can view current profile images only', async () => {
  const database = requireApp().get(DatabaseService);
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
    'base64',
  );
  async function attachAvatar(token: string, userId: string): Promise<string> {
    const created = await executeGraphql(
      token,
      `mutation CreateVisibleAvatar($input: CreateMediaUploadIntentInput!) {
        createMediaUploadIntent(input: $input) {
          uploadIntent { mediaObjectId url requiredHeaders { name value } }
        }
      }`,
      {
        input: {
          mimeType: 'image/png',
          originalName: 'fictional-profile.png',
          sizeBytes: image.byteLength,
        },
      },
    );
    const intent = requireRecordField(
      requireRecordField(created, 'createMediaUploadIntent'),
      'uploadIntent',
    );
    const mediaObjectId = requireStringField(intent, 'mediaObjectId');
    const upload = await fetch(requireStringField(intent, 'url'), {
      body: new Uint8Array(image),
      headers: requireUploadHeaders(intent),
      method: 'PUT',
    });
    assert.equal(upload.status, 200);
    await executeGraphql(
      token,
      `mutation ConfirmVisibleAvatar($input: MediaObjectReferenceInput!) {
        confirmMediaUpload(input: $input) { mediaObject { id status } }
      }`,
      { input: { mediaObjectId } },
    );
    const user = await database.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, preferredLanguage: true },
    });
    await executeGraphql(
      token,
      `mutation AttachVisibleAvatar($input: UpdateMyProfileInput!) {
        updateMyProfile(input: $input) { profile { avatarMediaObjectId } }
      }`,
      {
        input: {
          avatarMediaObjectId: mediaObjectId,
          displayName: user.displayName,
          preferredLanguage: user.preferredLanguage,
        },
      },
    );
    return mediaObjectId;
  }

  await attachAvatar(teacherToken, teacherId);
  await attachAvatar(studentToken, studentId);
  const operation = `mutation VisibleProfileAvatars($userIds: [ID!]!) {
    profileAvatarDownloadIntents(userIds: $userIds) { userId url }
  }`;
  const admin = await executeGraphql(adminToken, operation, {
    userIds: [teacherId, studentId],
  });
  const adminAvatars = requireArrayField(admin, 'profileAvatarDownloadIntents');
  assert.deepEqual(
    adminAvatars
      .map((item) =>
        requireStringField(requireRecord(item, 'avatar'), 'userId'),
      )
      .sort(),
    [teacherId, studentId].sort(),
  );
  for (const item of adminAvatars) {
    const response = await fetch(
      requireStringField(requireRecord(item, 'avatar'), 'url'),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  }

  const teacher = await executeGraphql(teacherToken, operation, {
    userIds: [teacherId, studentId],
  });
  const teacherAvatars = requireArrayField(
    teacher,
    'profileAvatarDownloadIntents',
  );
  assert.deepEqual(
    teacherAvatars.map((item) =>
      requireStringField(requireRecord(item, 'avatar'), 'userId'),
    ),
    [studentId],
  );
  const otherTeacherId = randomUUID();
  await database.user.create({
    data: {
      displayName: 'Unrelated Fictional Teacher',
      id: otherTeacherId,
      role: UserRole.TEACHER,
    },
  });
  const otherTeacherToken = await requireApp()
    .get(AuthService)
    .issueAccessToken({
      id: otherTeacherId,
      role: UserRole.TEACHER,
    });
  const unrelated = await executeGraphql(otherTeacherToken, operation, {
    userIds: [studentId],
  });
  assert.equal(
    requireArrayField(unrelated, 'profileAvatarDownloadIntents').length,
    0,
  );
  const denied = await executeGraphqlExpectingErrors(studentToken, operation, {
    userIds: [teacherId],
  });
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(denied, 'errors')[0],
        'authorization error',
      ),
      'extensions',
    ).code,
    'FORBIDDEN',
  );
});

void test('Speaking audio uploads are scoped to active owned attempts without widening general Student uploads', async () => {
  if (!app) throw new Error('Application is unavailable');
  const database = app.get(DatabaseService);
  const membership = await database.groupMembership.findFirstOrThrow({
    where: { studentId, groupId },
  });
  const category = await database.testCategory.create({
    data: { teacherId, name: `Reserved audio upload ${randomUUID()}` },
  });
  const paper = await database.testPaper.create({
    data: {
      academicYear: 2026,
      createdById: teacherId,
      groupId,
      practiceNumber: 120,
      slug: `reserved-audio-upload-${randomUUID()}`,
      sourceLabel: 'Fictional integration fixture.',
      title: 'Reserved Speaking audio upload paper',
    },
  });
  const speakingTest = await database.test.create({
    data: {
      categoryId: category.id,
      groupId,
      paperId: paper.id,
      skill: TestSkill.SPEAKING,
    },
  });
  const version = await database.testVersion.create({
    data: {
      testId: speakingTest.id,
      version: 1,
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'manual-rubric-v1',
      translations: {
        create: { language: Language.EN, title: 'Reserved upload test' },
      },
    },
  });
  const section = await database.testSection.create({
    data: {
      testVersionId: version.id,
      position: 1,
      translations: {
        create: {
          language: Language.EN,
          title: 'Reserved Part 1',
          instructions: 'Record a fictional audio response.',
        },
      },
    },
  });
  const question = await database.question.create({
    data: {
      testVersionId: version.id,
      sectionId: section.id,
      position: 1,
      kind: QuestionKind.AUDIO_RESPONSE,
      translations: {
        create: {
          language: Language.EN,
          prompt: 'Describe a fictional place.',
        },
      },
    },
  });
  const attempt = await database.attempt.create({
    data: {
      studentId,
      groupMembershipId: membership.id,
      testVersionId: version.id,
      attemptNumber: 1,
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
  const uploadInput = {
    mimeType: 'audio/webm',
    originalName: 'reserved-speaking-response.webm',
    sizeBytes: audio.byteLength,
  };
  const input = {
    ...uploadInput,
    attemptId: attempt.id,
    questionId: question.id,
  };
  const createMutation = `mutation SpeakingUpload($input: CreateAttemptAudioUploadInput!) {
    createAttemptAudioUploadIntent(input: $input) {
      uploadIntent { mediaObjectId url requiredHeaders { name value } }
    }
  }`;
  const general = await executeGraphqlExpectingErrors(
    studentToken,
    `mutation GeneralAudio($input: CreateMediaUploadIntentInput!) {
      createMediaUploadIntent(input: $input) { uploadIntent { mediaObjectId } }
    }`,
    { input: uploadInput },
  );
  assert.match(JSON.stringify(general.errors), /FORBIDDEN/);
  const wrongQuestion = await executeGraphqlExpectingErrors(
    studentToken,
    createMutation,
    { input: { ...input, questionId: randomUUID() } },
  );
  assert.match(JSON.stringify(wrongQuestion.errors), /ATTEMPT_NOT_ACTIVE/);
  const nonAudio = await executeGraphqlExpectingErrors(
    studentToken,
    createMutation,
    {
      input: { ...input, mimeType: 'image/png', originalName: 'reserved.png' },
    },
  );
  assert.match(JSON.stringify(nonAudio.errors), /BAD_USER_INPUT/);
  const otherStudent = await database.user.create({
    data: { displayName: 'Reserved Audio Owner', role: UserRole.STUDENT },
  });
  const otherToken = await app.get(AuthService).issueAccessToken({
    id: otherStudent.id,
    role: UserRole.STUDENT,
  });
  const foreign = await executeGraphqlExpectingErrors(
    otherToken,
    createMutation,
    { input },
  );
  assert.match(JSON.stringify(foreign.errors), /ATTEMPT_NOT_ACTIVE/);

  const created = await executeGraphql(studentToken, createMutation, { input });
  const intent = requireRecordField(
    requireRecordField(created, 'createAttemptAudioUploadIntent'),
    'uploadIntent',
  );
  const mediaObjectId = requireStringField(intent, 'mediaObjectId');
  const uploaded = await fetch(requireStringField(intent, 'url'), {
    method: 'PUT',
    body: audio,
    headers: requireUploadHeaders(intent),
  });
  assert.equal(uploaded.status, 200);
  const confirmed = await executeGraphql(
    studentToken,
    `mutation ConfirmSpeaking($input: ConfirmAttemptAudioUploadInput!) {
      confirmAttemptAudioUpload(input: $input) { mediaObject { id status malwareStatus } }
    }`,
    {
      input: { attemptId: attempt.id, questionId: question.id, mediaObjectId },
    },
  );
  const media = requireRecordField(
    requireRecordField(confirmed, 'confirmAttemptAudioUpload'),
    'mediaObject',
  );
  assert.equal(media.status, 'READY');
  assert.equal(media.malwareStatus, 'CLEAN');
  await executeGraphql(
    studentToken,
    `mutation SaveSpeakingAudio($input: SaveAttemptAnswerInput!) {
      saveAttemptAnswer(input: $input, language: EN) { attempt { id } }
    }`,
    {
      input: {
        attemptId: attempt.id,
        questionId: question.id,
        responseMediaObjectId: mediaObjectId,
      },
    },
  );
  const answer = await database.attemptAnswer.findUniqueOrThrow({
    where: {
      attemptId_questionId: { attemptId: attempt.id, questionId: question.id },
    },
  });
  assert.equal(answer.responseMediaObjectId, mediaObjectId);
  const stored = await database.mediaObject.findUniqueOrThrow({
    where: { id: mediaObjectId },
  });
  assert.equal(stored.createdById, studentId);
  assert.equal(stored.visibility, MediaVisibility.OWNER_ONLY);

  await database.attempt.update({
    where: { id: attempt.id },
    data: {
      status: AttemptStatus.SUBMITTED,
      submittedAt: new Date(),
      submissionReason: AttemptSubmissionReason.MANUAL,
    },
  });
  const closed = await executeGraphqlExpectingErrors(
    studentToken,
    createMutation,
    { input },
  );
  assert.match(JSON.stringify(closed.errors), /ATTEMPT_NOT_ACTIVE/);
  const expired = await database.attempt.create({
    data: {
      studentId,
      groupMembershipId: membership.id,
      testVersionId: version.id,
      attemptNumber: 2,
      startedAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
  const expiredUpload = await executeGraphqlExpectingErrors(
    studentToken,
    createMutation,
    { input: { ...input, attemptId: expired.id } },
  );
  assert.match(JSON.stringify(expiredUpload.errors), /ATTEMPT_NOT_ACTIVE/);
});

void test('Teacher can upload, confirm, and download an immutable private PDF', async () => {
  const pdf = Buffer.from('%PDF-1.7\n%%EOF');
  const created = await executeGraphql(
    teacherToken,
    `mutation CreateUpload($input: CreateMediaUploadIntentInput!) {
      createMediaUploadIntent(input: $input) {
        uploadIntent {
          mediaObjectId method url sizeBytes expiresAt
          requiredHeaders { name value }
        }
      }
    }`,
    {
      input: {
        mimeType: 'application/pdf',
        originalName: 'lesson.pdf',
        sizeBytes: pdf.byteLength,
      },
    },
  );
  const intent = requireRecordField(
    requireRecordField(created, 'createMediaUploadIntent'),
    'uploadIntent',
  );
  const mediaObjectId = requireStringField(intent, 'mediaObjectId');
  assert.equal(intent.method, 'PUT');
  assert.equal(intent.sizeBytes, pdf.byteLength);

  const uploadResponse = await fetch(requireStringField(intent, 'url'), {
    body: pdf,
    headers: requireUploadHeaders(intent),
    method: 'PUT',
  });
  assert.equal(uploadResponse.status, 200);

  const repeatedUpload = await fetch(requireStringField(intent, 'url'), {
    body: pdf,
    headers: requireUploadHeaders(intent),
    method: 'PUT',
  });
  assert.equal(repeatedUpload.status, 412);

  const confirmed = await executeGraphql(
    teacherToken,
    `mutation ConfirmUpload($input: MediaObjectReferenceInput!) {
      confirmMediaUpload(input: $input) {
        mediaObject {
          id status mediaType mimeType sizeBytes checksumSha256 verifiedAt
        }
      }
    }`,
    { input: { mediaObjectId } },
  );
  const mediaObject = requireRecordField(
    requireRecordField(confirmed, 'confirmMediaUpload'),
    'mediaObject',
  );
  assert.equal(mediaObject.status, 'READY');
  assert.equal(mediaObject.mediaType, 'PDF');
  assert.equal(mediaObject.sizeBytes, pdf.byteLength);
  assert.equal(
    mediaObject.checksumSha256,
    createHash('sha256').update(pdf).digest('hex'),
  );

  const confirmedAgain = await executeGraphql(
    teacherToken,
    `mutation ConfirmAgain($input: MediaObjectReferenceInput!) {
      confirmMediaUpload(input: $input) { mediaObject { id status } }
    }`,
    { input: { mediaObjectId } },
  );
  assert.equal(
    requireRecordField(
      requireRecordField(confirmedAgain, 'confirmMediaUpload'),
      'mediaObject',
    ).status,
    'READY',
  );

  const download = await executeGraphql(
    teacherToken,
    `mutation Download($input: MediaObjectReferenceInput!) {
      createMediaDownloadIntent(input: $input) {
        downloadIntent { url expiresAt }
      }
    }`,
    { input: { mediaObjectId } },
  );
  const downloadIntent = requireRecordField(
    requireRecordField(download, 'createMediaDownloadIntent'),
    'downloadIntent',
  );
  const downloaded = await fetch(requireStringField(downloadIntent, 'url'));
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
});

void test('Student cannot create upload intents and invalid signatures are rejected', async () => {
  const forbidden = await executeGraphqlExpectingErrors(
    studentToken,
    `mutation StudentUpload($input: CreateMediaUploadIntentInput!) {
      createMediaUploadIntent(input: $input) {
        uploadIntent { mediaObjectId }
      }
    }`,
    {
      input: {
        mimeType: 'application/pdf',
        originalName: 'private.pdf',
        sizeBytes: 4,
      },
    },
  );
  const forbiddenError = requireRecord(
    requireArrayField(forbidden, 'errors')[0],
    'forbidden error',
  );
  assert.equal(
    requireRecordField(forbiddenError, 'extensions').code,
    'FORBIDDEN',
  );

  const invalidBytes = Buffer.from('NOPE');
  const created = await executeGraphql(
    teacherToken,
    `mutation InvalidUpload($input: CreateMediaUploadIntentInput!) {
      createMediaUploadIntent(input: $input) {
        uploadIntent {
          mediaObjectId url requiredHeaders { name value }
        }
      }
    }`,
    {
      input: {
        mimeType: 'application/pdf',
        originalName: 'invalid.pdf',
        sizeBytes: invalidBytes.byteLength,
      },
    },
  );
  const intent = requireRecordField(
    requireRecordField(created, 'createMediaUploadIntent'),
    'uploadIntent',
  );
  const mediaObjectId = requireStringField(intent, 'mediaObjectId');
  const upload = await fetch(requireStringField(intent, 'url'), {
    body: invalidBytes,
    headers: requireUploadHeaders(intent),
    method: 'PUT',
  });
  assert.equal(upload.status, 200);

  const rejected = await executeGraphqlExpectingErrors(
    teacherToken,
    `mutation RejectInvalid($input: MediaObjectReferenceInput!) {
      confirmMediaUpload(input: $input) { mediaObject { id status } }
    }`,
    { input: { mediaObjectId } },
  );
  const rejectedError = requireRecord(
    requireArrayField(rejected, 'errors')[0],
    'rejected error',
  );
  assert.equal(
    requireRecordField(rejectedError, 'extensions').code,
    'BAD_USER_INPUT',
  );

  const persisted = await requireApp()
    .get(DatabaseService)
    .mediaObject.findUnique({
      where: { id: mediaObjectId },
      select: { rejectionCode: true, status: true },
    });
  assert.ok(persisted !== null);
  assert.equal(persisted.status, 'REJECTED');
  assert.equal(persisted.rejectionCode, 'INVALID_FILE_SIGNATURE');
});

void test('malware scan rejects an infected upload before domain attachment', async () => {
  const infectedPdf = Buffer.from('%PDF-1.7\nFAKE-MALWARE-MARKER\n%%EOF');
  const created = await executeGraphql(
    teacherToken,
    `mutation CreateInfectedUpload($input: CreateMediaUploadIntentInput!) {
      createMediaUploadIntent(input: $input) {
        uploadIntent { mediaObjectId url requiredHeaders { name value } }
      }
    }`,
    {
      input: {
        mimeType: 'application/pdf',
        originalName: 'infected.pdf',
        sizeBytes: infectedPdf.byteLength,
      },
    },
  );
  const intent = requireRecordField(
    requireRecordField(created, 'createMediaUploadIntent'),
    'uploadIntent',
  );
  const mediaObjectId = requireStringField(intent, 'mediaObjectId');
  const upload = await fetch(requireStringField(intent, 'url'), {
    body: infectedPdf,
    headers: requireUploadHeaders(intent),
    method: 'PUT',
  });
  assert.equal(upload.status, 200);

  const rejected = await executeGraphqlExpectingErrors(
    teacherToken,
    `mutation ConfirmInfected($input: MediaObjectReferenceInput!) {
      confirmMediaUpload(input: $input) { mediaObject { id } }
    }`,
    { input: { mediaObjectId } },
  );
  const error = requireRecord(
    requireArrayField(rejected, 'errors')[0],
    'malware error',
  );
  assert.equal(requireRecordField(error, 'extensions').code, 'BAD_USER_INPUT');

  const persisted = await requireApp()
    .get(DatabaseService)
    .mediaObject.findUnique({
      where: { id: mediaObjectId },
      select: {
        malwareEngine: true,
        malwareStatus: true,
        malwareThreatName: true,
        rejectionCode: true,
        status: true,
      },
    });
  assert.ok(persisted !== null);
  assert.equal(persisted.status, 'REJECTED');
  assert.equal(persisted.malwareStatus, 'INFECTED');
  assert.equal(persisted.malwareEngine, 'CLAMAV');
  assert.equal(persisted.malwareThreatName, 'Test-Malware');
  assert.equal(persisted.rejectionCode, 'MALWARE_DETECTED');
});

void test('Teacher manages Library and only an authorized Student can read and download', async () => {
  const pdf = Buffer.from('%PDF-1.7\nLibrary lesson\n%%EOF');
  const mediaObjectId = await uploadAndConfirmPdf('library-lesson.pdf', pdf);
  const categoryResponse = await executeGraphql(
    teacherToken,
    `mutation CreateCategory($input: CreateLibraryCategoryInput!) {
      createLibraryCategory(input: $input) { category { id name status } }
    }`,
    { input: { name: 'Reading' } },
  );
  const category = requireRecordField(
    requireRecordField(categoryResponse, 'createLibraryCategory'),
    'category',
  );
  const categoryId = requireStringField(category, 'id');

  const itemResponse = await executeGraphql(
    teacherToken,
    `mutation CreateLibraryItem($input: CreateLibraryItemInput!) {
      createLibraryItem(input: $input) {
        item {
          id status visibility groupIds
          translations { language title }
          attachments { position mediaObject { id malwareStatus status } }
        }
      }
    }`,
    {
      input: {
        categoryId,
        groupIds: [groupId],
        mediaObjectIds: [mediaObjectId],
        primaryLanguage: 'UZ',
        translations: [
          {
            description: 'Student uchun fake material',
            language: 'UZ',
            title: 'Reading lesson',
          },
        ],
        visibility: 'SELECTED_GROUPS',
      },
    },
  );
  const item = requireRecordField(
    requireRecordField(itemResponse, 'createLibraryItem'),
    'item',
  );
  const libraryItemId = requireStringField(item, 'id');
  assert.equal(item.status, 'ACTIVE');
  assert.deepEqual(item.groupIds, [groupId]);

  const lessonResource = await executeGraphql(
    teacherToken,
    `mutation CreateLessonResource($input: CreateLessonMaterialInput!) {
      createLessonMaterial(input: $input) { material { id kind title mediaObject { id } } }
    }`,
    {
      input: {
        groupId,
        kind: 'TASK',
        libraryItemId,
        position: 2,
      },
    },
  );
  const resource = requireRecordField(
    requireRecordField(lessonResource, 'createLessonMaterial'),
    'material',
  );
  assert.equal(resource.kind, 'TASK');
  assert.equal(resource.title, 'Reading lesson');
  assert.equal(requireRecordField(resource, 'mediaObject').id, mediaObjectId);

  const materialList = await executeGraphql(
    teacherToken,
    `query TeacherLessonResources($groupId: ID!, $language: Language!) {
      teacherGroupMaterials(groupId: $groupId, language: $language, first: 20) {
        edges { node { id kind title mediaObject { id mimeType } } }
      }
    }`,
    { groupId, language: 'UZ' },
  );
  const materialEdges = requireArrayField(
    requireRecordField(materialList, 'teacherGroupMaterials'),
    'edges',
  );
  assert.equal(materialEdges.length, 1);
  assert.equal(
    requireRecordField(requireRecord(materialEdges[0], 'edge'), 'node').title,
    'Reading lesson',
  );

  const studentList = await executeGraphql(
    studentToken,
    `query StudentLibrary($language: Language!) {
      studentLibraryItems(language: $language) {
        edges {
          node {
            id title description
            attachments { mediaObject { id malwareStatus status } }
          }
        }
        pageInfo { hasNextPage }
      }
    }`,
    { language: 'UZ' },
  );
  const studentEdges = requireArrayField(
    requireRecordField(studentList, 'studentLibraryItems'),
    'edges',
  );
  assert.equal(studentEdges.length, 1);
  assert.equal(
    requireRecordField(requireRecord(studentEdges[0], 'edge'), 'node').title,
    'Reading lesson',
  );

  const download = await executeGraphql(
    studentToken,
    `mutation StudentDownload($input: CreateLibraryDownloadIntentInput!) {
      createStudentLibraryDownloadIntent(input: $input) {
        downloadIntent { url expiresAt }
      }
    }`,
    { input: { libraryItemId, mediaObjectId } },
  );
  const downloadIntent = requireRecordField(
    requireRecordField(download, 'createStudentLibraryDownloadIntent'),
    'downloadIntent',
  );
  const downloaded = await fetch(requireStringField(downloadIntent, 'url'));
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);

  const outsiderId = randomUUID();
  const database = requireApp().get(DatabaseService);
  await database.user.create({
    data: {
      displayName: 'Student without membership',
      id: outsiderId,
      role: UserRole.STUDENT,
    },
  });
  const outsiderToken = await requireApp().get(AuthService).issueAccessToken({
    id: outsiderId,
    role: UserRole.STUDENT,
  });
  const denied = await executeGraphqlExpectingErrors(
    outsiderToken,
    `query DeniedLibrary($libraryItemId: ID!, $language: Language!) {
      studentLibraryItem(libraryItemId: $libraryItemId, language: $language) {
        id
      }
    }`,
    { language: 'UZ', libraryItemId },
  );
  assert.equal(
    requireRecordField(
      requireRecord(requireArrayField(denied, 'errors')[0], 'denied error'),
      'extensions',
    ).code,
    'NOT_FOUND',
  );

  await executeGraphql(
    teacherToken,
    `mutation ArchiveItem($input: SetLibraryItemArchivedInput!) {
      setLibraryItemArchived(input: $input) { item { id status archivedAt } }
    }`,
    { input: { archived: true, libraryItemId } },
  );
  const hiddenList = await executeGraphql(
    studentToken,
    `query HiddenLibrary($language: Language!) {
      studentLibraryItems(language: $language) { edges { node { id } } }
    }`,
    { language: 'UZ' },
  );
  assert.equal(
    requireArrayField(
      requireRecordField(hiddenList, 'studentLibraryItems'),
      'edges',
    ).length,
    0,
  );
});

void test('Section 8 profile, learning, public, and operations flows are connected', async () => {
  const profile = await executeGraphql(
    teacherToken,
    `mutation UpdateProfile($input: UpdateMyProfileInput!) {
      updateMyProfile(input: $input) { profile { id displayName preferredLanguage } }
    }`,
    { input: { displayName: 'Section 8 Teacher', preferredLanguage: 'UZ' } },
  );
  assert.equal(
    requireRecordField(
      requireRecordField(profile, 'updateMyProfile'),
      'profile',
    ).displayName,
    'Section 8 Teacher',
  );

  const lesson = await executeGraphql(
    teacherToken,
    `mutation CreateLesson($input: CreateLessonInput!) {
      createLesson(input: $input) { lesson { id status } }
    }`,
    {
      input: {
        endsAt: '2032-01-10T11:00:00.000Z',
        groupId,
        startsAt: '2032-01-10T10:00:00.000Z',
        translations: [{ language: 'UZ', title: 'Sinov darsi' }],
      },
    },
  );
  const lessonId = requireStringField(
    requireRecordField(requireRecordField(lesson, 'createLesson'), 'lesson'),
    'id',
  );
  await executeGraphql(
    teacherToken,
    `mutation ScheduleLesson($input: SetLessonStatusInput!) {
      setLessonStatus(input: $input) { lesson { id status } }
    }`,
    { input: { lessonId, status: 'SCHEDULED' } },
  );

  const assignment = await executeGraphql(
    teacherToken,
    `mutation CreateAssignment($input: CreateAssignmentInput!) {
      createAssignment(input: $input) { assignment { id status } }
    }`,
    {
      input: {
        allowLate: false,
        groupId,
        lessonId,
        translations: [{ language: 'UZ', title: 'Uy vazifasi' }],
      },
    },
  );
  const assignmentId = requireStringField(
    requireRecordField(
      requireRecordField(assignment, 'createAssignment'),
      'assignment',
    ),
    'id',
  );
  await executeGraphql(
    teacherToken,
    `mutation PublishAssignment($input: AssignmentIdInput!) {
      publishAssignment(input: $input) { assignment { id status } }
    }`,
    { input: { assignmentId } },
  );
  const submission = await executeGraphql(
    studentToken,
    `mutation SubmitAssignment($input: SubmitAssignmentInput!) {
      submitAssignment(input: $input) { submission { id status } }
    }`,
    { input: { assignmentId, text: 'Tayyor javob' } },
  );
  const submissionId = requireStringField(
    requireRecordField(
      requireRecordField(submission, 'submitAssignment'),
      'submission',
    ),
    'id',
  );
  await executeGraphql(
    teacherToken,
    `mutation ReviewSubmission($input: ReviewAssignmentSubmissionInput!) {
      reviewAssignmentSubmission(input: $input) { submission { id status score } }
    }`,
    {
      input: {
        feedback: 'Qabul qilindi',
        score: 90,
        status: 'REVIEWED',
        submissionId,
      },
    },
  );

  const slug = `section-${randomUUID().replaceAll('-', '')}`;
  await executeGraphql(
    adminToken,
    `mutation CreateCourse($input: UpsertCourseInput!) {
      createCourseDraft(input: $input) { course { id slug status } }
    }`,
    {
      input: {
        slug,
        translations: [
          { description: 'Section 8 course', language: 'UZ', title: 'Kurs' },
        ],
      },
    },
  );
  const overview = await executeGraphql(
    adminToken,
    `query OperationalOverview { adminOperationalOverview { activeGroups activeUsers } }`,
  );
  assert.equal(
    typeof requireRecordField(overview, 'adminOperationalOverview')
      .activeGroups,
    'number',
  );
});

void test('Lesson creation relies on the group schedule without a second slot-conflict check', async () => {
  const createOverlappingLesson = async (title: string) =>
    executeGraphql(
      teacherToken,
      `mutation CreateOverlappingLesson($input: CreateLessonInput!) {
        createLesson(input: $input) { lesson { id startsAt endsAt } }
      }`,
      {
        input: {
          endsAt: '2034-03-14T12:00:00.000Z',
          groupId,
          startsAt: '2034-03-14T09:00:00.000Z',
          translations: [{ language: 'EN', title }],
        },
      },
    );

  const first = await createOverlappingLesson('Fictional overlapping lesson A');
  const second = await createOverlappingLesson(
    'Fictional overlapping lesson B',
  );
  const firstLesson = requireRecordField(
    requireRecordField(first, 'createLesson'),
    'lesson',
  );
  const secondLesson = requireRecordField(
    requireRecordField(second, 'createLesson'),
    'lesson',
  );

  assert.notEqual(
    requireStringField(firstLesson, 'id'),
    requireStringField(secondLesson, 'id'),
  );
  assert.equal(firstLesson.startsAt, secondLesson.startsAt);
  assert.equal(firstLesson.endsAt, secondLesson.endsAt);
});

void test('Teacher lesson plans receive stable numbers and soft-delete from the workspace', async () => {
  const created = await executeGraphql(
    teacherToken,
    `mutation CreateNumberedLesson($input: CreateLessonInput!) {
      createLesson(input: $input) {
        lesson { id lessonNumber archivedAt }
      }
    }`,
    {
      input: {
        endsAt: '2033-02-12T11:30:00.000Z',
        groupId,
        startsAt: '2033-02-12T10:00:00.000Z',
        translations: [
          { language: 'EN', title: 'Fictional lesson-plan contract test' },
        ],
      },
    },
  );
  const lesson = requireRecordField(
    requireRecordField(created, 'createLesson'),
    'lesson',
  );
  const lessonId = requireStringField(lesson, 'id');
  assert.equal(lesson.archivedAt, null);
  assert.equal(typeof lesson.lessonNumber, 'number');
  assert.ok(Number(lesson.lessonNumber) > 0);

  const mediaObjectId = await uploadAndConfirmPdf(
    'archived-lesson-material.pdf',
    Buffer.from('%PDF-1.7\nArchived lesson material\n%%EOF'),
  );
  const categoryResponse = await executeGraphql(
    teacherToken,
    `mutation CreateArchivedLessonCategory($input: CreateLibraryCategoryInput!) {
      createLibraryCategory(input: $input) { category { id } }
    }`,
    { input: { name: `Archived lesson ${randomUUID().slice(0, 8)}` } },
  );
  const categoryId = requireStringField(
    requireRecordField(
      requireRecordField(categoryResponse, 'createLibraryCategory'),
      'category',
    ),
    'id',
  );
  const itemResponse = await executeGraphql(
    teacherToken,
    `mutation CreateArchivedLessonItem($input: CreateLibraryItemInput!) {
      createLibraryItem(input: $input) { item { id } }
    }`,
    {
      input: {
        categoryId,
        groupIds: [groupId],
        mediaObjectIds: [mediaObjectId],
        primaryLanguage: 'EN',
        translations: [{ language: 'EN', title: 'Archived lesson material' }],
        visibility: 'SELECTED_GROUPS',
      },
    },
  );
  const libraryItemId = requireStringField(
    requireRecordField(
      requireRecordField(itemResponse, 'createLibraryItem'),
      'item',
    ),
    'id',
  );
  const materialResponse = await executeGraphql(
    teacherToken,
    `mutation LinkArchivedLessonMaterial($input: CreateLessonMaterialInput!) {
      createLessonMaterial(input: $input) { material { id } }
    }`,
    {
      input: {
        groupId,
        kind: 'MATERIAL',
        lessonId,
        libraryItemId,
        position: 1,
      },
    },
  );
  const lessonMaterialId = requireStringField(
    requireRecordField(
      requireRecordField(materialResponse, 'createLessonMaterial'),
      'material',
    ),
    'id',
  );

  const listed = await executeGraphql(
    teacherToken,
    `query NumberedLessons($groupId: ID!) {
      teacherGroupLessons(groupId: $groupId, first: 50) {
        edges { node { id lessonNumber } }
      }
    }`,
    { groupId },
  );
  const listedIds = requireArrayField(
    requireRecordField(listed, 'teacherGroupLessons'),
    'edges',
  ).map((edge) =>
    requireStringField(
      requireRecordField(requireRecord(edge, 'lesson edge'), 'node'),
      'id',
    ),
  );
  assert.ok(listedIds.includes(lessonId));

  const hiddenDraft = await executeGraphql(
    studentToken,
    `query StudentDraftVisibility($groupId: ID!) {
      studentGroupLessons(groupId: $groupId, first: 50) {
        edges { node { id } }
      }
      studentGroupMaterials(groupId: $groupId, language: EN, first: 50) {
        edges { node { id } }
      }
    }`,
    { groupId },
  );
  for (const [field, privateId] of [
    ['studentGroupLessons', lessonId],
    ['studentGroupMaterials', lessonMaterialId],
  ] as const) {
    const ids = requireArrayField(
      requireRecordField(hiddenDraft, field),
      'edges',
    ).map((edge) =>
      requireStringField(
        requireRecordField(requireRecord(edge, `${field} edge`), 'node'),
        'id',
      ),
    );
    assert.equal(ids.includes(privateId), false);
  }

  await executeGraphql(
    teacherToken,
    `mutation PublishLessonForStudent($input: SetLessonStatusInput!) {
      setLessonStatus(input: $input) { lesson { id status } }
    }`,
    { input: { lessonId, status: 'SCHEDULED' } },
  );

  const studentGroup = await executeGraphql(
    studentToken,
    `query StudentCurrentGroupForLessons {
      studentCurrentGroup { group { id name } }
    }`,
  );
  assert.equal(
    requireStringField(
      requireRecordField(
        requireRecordField(studentGroup, 'studentCurrentGroup'),
        'group',
      ),
      'id',
    ),
    groupId,
  );
  const studentLessons = await executeGraphql(
    studentToken,
    `query StudentLessonsForGroup($groupId: ID!) {
      studentGroupLessons(groupId: $groupId, first: 50) {
        edges { node { id lessonNumber } }
      }
      studentGroupMaterials(groupId: $groupId, language: EN, first: 50) {
        edges { node { id lessonId libraryItemId kind mediaObject { id } } }
      }
    }`,
    { groupId },
  );
  const studentLessonIds = requireArrayField(
    requireRecordField(studentLessons, 'studentGroupLessons'),
    'edges',
  ).map((edge) =>
    requireStringField(
      requireRecordField(requireRecord(edge, 'student lesson edge'), 'node'),
      'id',
    ),
  );
  assert.ok(studentLessonIds.includes(lessonId));
  const studentMaterialIds = requireArrayField(
    requireRecordField(studentLessons, 'studentGroupMaterials'),
    'edges',
  ).map((edge) =>
    requireStringField(
      requireRecordField(requireRecord(edge, 'student material edge'), 'node'),
      'id',
    ),
  );
  assert.ok(studentMaterialIds.includes(lessonMaterialId));

  const inaccessible = await executeGraphqlExpectingErrors(
    studentToken,
    `query OtherGroupLessons($groupId: ID!) {
      studentGroupLessons(groupId: $groupId) { edges { node { id } } }
    }`,
    { groupId: randomUUID() },
  );
  assert.ok('errors' in inaccessible);

  await executeGraphql(
    teacherToken,
    `mutation ArchiveLesson($input: SetLessonArchivedInput!) {
      setLessonArchived(input: $input) { lesson { id archivedAt } }
    }`,
    { input: { archived: true, lessonId } },
  );
  const hidden = await executeGraphql(
    teacherToken,
    `query HiddenLesson($groupId: ID!) {
      teacherGroupLessons(groupId: $groupId, first: 50) {
        edges { node { id } }
      }
    }`,
    { groupId },
  );
  const hiddenIds = requireArrayField(
    requireRecordField(hidden, 'teacherGroupLessons'),
    'edges',
  ).map((edge) =>
    requireStringField(
      requireRecordField(requireRecord(edge, 'lesson edge'), 'node'),
      'id',
    ),
  );
  assert.equal(hiddenIds.includes(lessonId), false);

  const materialsAfterArchive = await executeGraphql(
    teacherToken,
    `query MaterialsAfterLessonArchive($groupId: ID!) {
      teacherGroupMaterials(groupId: $groupId, language: EN, first: 100) {
        edges { node { id } }
      }
    }`,
    { groupId },
  );
  const visibleMaterialIds = requireArrayField(
    requireRecordField(materialsAfterArchive, 'teacherGroupMaterials'),
    'edges',
  ).map((edge) =>
    requireStringField(
      requireRecordField(requireRecord(edge, 'material edge'), 'node'),
      'id',
    ),
  );
  assert.equal(visibleMaterialIds.includes(lessonMaterialId), false);

  const studentAfterArchive = await executeGraphql(
    studentToken,
    `query StudentLessonsAfterArchive($groupId: ID!) {
      studentGroupLessons(groupId: $groupId, first: 50) {
        edges { node { id } }
      }
      studentGroupMaterials(groupId: $groupId, language: EN, first: 50) {
        edges { node { id } }
      }
    }`,
    { groupId },
  );
  for (const field of ['studentGroupLessons', 'studentGroupMaterials']) {
    const ids = requireArrayField(
      requireRecordField(studentAfterArchive, field),
      'edges',
    ).map((edge) =>
      requireStringField(
        requireRecordField(requireRecord(edge, `${field} edge`), 'node'),
        'id',
      ),
    );
    assert.equal(
      ids.includes(
        field === 'studentGroupLessons' ? lessonId : lessonMaterialId,
      ),
      false,
    );
  }

  const database = requireApp().get(DatabaseService);
  const persisted = await database.lesson.findUniqueOrThrow({
    select: { archivedAt: true },
    where: { id: lessonId },
  });
  assert.ok(persisted.archivedAt instanceof Date);
  assert.equal(
    await database.auditLog.count({
      where: { action: 'LESSON_ARCHIVED', targetId: lessonId },
    }),
    1,
  );

  const replacement = await executeGraphql(
    teacherToken,
    `mutation ReplaceArchivedLesson($input: CreateLessonInput!) {
      createLesson(input: $input) { lesson { id startsAt endsAt } }
    }`,
    {
      input: {
        endsAt: '2033-02-12T11:30:00.000Z',
        groupId,
        startsAt: '2033-02-12T10:00:00.000Z',
        translations: [
          { language: 'EN', title: 'Replacement for archived lesson' },
        ],
      },
    },
  );
  assert.notEqual(
    requireStringField(
      requireRecordField(
        requireRecordField(replacement, 'createLesson'),
        'lesson',
      ),
      'id',
    ),
    lessonId,
  );
});

void test('public registration and contact endpoints persist validated submissions', async () => {
  if (app === undefined) throw new Error('Test application is not ready.');
  const database = app.get(DatabaseService);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const courseSlug = `public-course-${suffix}`;
  const course = await database.publicCourse.create({
    data: {
      accent: PublicCourseAccent.BLUE,
      category: PublicCourseCategory.ENGLISH,
      publishedAt: new Date(),
      slug: courseSlug,
      status: PublicContentStatus.PUBLISHED,
      symbol: 'EN',
      translations: {
        create: {
          description: 'Fake course used by the public API integration test.',
          language: Language.EN,
          title: 'Fake public course',
        },
      },
    },
  });
  const event = await database.publicEvent.create({
    data: {
      capacity: 8,
      publishedAt: new Date(),
      slug: `public-event-${suffix}`,
      startsAt: new Date(Date.now() + 86_400_000),
      status: PublicContentStatus.PUBLISHED,
      timelineStatus: PublicEventTimelineStatus.UPCOMING,
      translations: {
        create: {
          description: 'Fake event used by the public API integration test.',
          language: Language.EN,
          title: 'Fake public event',
        },
      },
    },
  });
  await database.publicExamOffering.create({
    data: {
      key: `exam-${suffix}`,
      publishedAt: new Date(),
      status: PublicContentStatus.PUBLISHED,
      translations: {
        create: {
          description: 'Fake exam used by the public API integration test.',
          duration: '60 minutes',
          formatLabel: 'In person',
          language: Language.EN,
          level: 'B1',
          title: 'Fake public exam',
        },
      },
    },
  });

  const courseResponse = await executeGraphql(
    undefined,
    `mutation RegisterCourse($input: RegisterForCourseInput!) {
      registerForCourse(input: $input) { accepted receiptId }
    }`,
    {
      input: {
        consent: true,
        courseSlug,
        email: `course-${suffix}@example.com`,
        locale: 'EN',
        name: 'Fake Course Learner',
        phone: `+9989000${suffix.slice(0, 5)}`,
      },
    },
  );
  assert.equal(
    requireRecordField(courseResponse, 'registerForCourse').accepted,
    true,
  );

  const eventResponse = await executeGraphql(
    undefined,
    `mutation RegisterEvent($input: RegisterForEventInput!) {
      registerForEvent(input: $input) { accepted receiptId }
    }`,
    {
      input: {
        consent: true,
        email: `event-${suffix}@example.com`,
        eventId: event.id,
        locale: 'EN',
        name: 'Fake Event Guest',
        participantCount: 2,
        phone: `+9989100${suffix.slice(0, 5)}`,
      },
    },
  );
  assert.equal(
    requireRecordField(eventResponse, 'registerForEvent').accepted,
    true,
  );

  const examResponse = await executeGraphql(
    undefined,
    `mutation RegisterExam($input: SubmitExamRegistrationInput!) {
      submitExamRegistration(input: $input) { accepted receiptId }
    }`,
    {
      input: {
        consent: true,
        currentLevel: 'B1',
        email: `exam-${suffix}@example.com`,
        locale: 'EN',
        name: 'Fake Exam Candidate',
        offeringKey: `exam-${suffix}`,
        phone: `+9989200${suffix.slice(0, 5)}`,
      },
    },
  );
  assert.equal(
    requireRecordField(examResponse, 'submitExamRegistration').accepted,
    true,
  );

  const contactResponse = await executeGraphql(
    undefined,
    `mutation Contact($input: SubmitContactRequestInput!) {
      submitContactRequest(input: $input) { accepted receiptId }
    }`,
    {
      input: {
        consent: true,
        email: `contact-${suffix}@example.com`,
        locale: 'EN',
        message: 'Fake contact request for integration testing.',
        name: 'Fake Contact',
        subject: 'API integration test',
      },
    },
  );
  assert.equal(
    requireRecordField(contactResponse, 'submitContactRequest').accepted,
    true,
  );
  const contactReceiptId = requireStringField(
    requireRecordField(contactResponse, 'submitContactRequest'),
    'receiptId',
  );
  const adminMessagesResponse = await executeGraphql(
    adminToken,
    `query AdminMessages($first: Int) {
      adminContactRequests(first: $first) {
        edges { node { id name email phone subject message status createdAt } }
      }
    }`,
    { first: 100 },
  );
  const adminMessageEdges = requireArrayField(
    requireRecordField(adminMessagesResponse, 'adminContactRequests'),
    'edges',
  );
  const persistedAdminMessage = requireRecord(
    adminMessageEdges
      .map((edge) =>
        requireRecordField(requireRecord(edge, 'message edge'), 'node'),
      )
      .find((node) => node.id === contactReceiptId),
    'persisted admin message',
  );
  assert.equal(persistedAdminMessage.subject, 'API integration test');
  assert.equal(
    persistedAdminMessage.message,
    'Fake contact request for integration testing.',
  );

  assert.equal(
    await database.courseRegistration.count({ where: { courseId: course.id } }),
    1,
  );
  assert.equal(
    await database.eventRegistration.count({ where: { eventId: event.id } }),
    1,
  );
  assert.equal(
    await database.examRegistration.count({
      where: { email: `exam-${suffix}@example.com` },
    }),
    1,
  );
  assert.equal(
    await database.contactRequest.count({
      where: { email: `contact-${suffix}@example.com` },
    }),
    1,
  );
});

void test('generated schema releases answer review only through the scored-result contract', async () => {
  const schema = await readFile(
    resolve(__dirname, '../../../packages/graphql/schema.graphql'),
    'utf8',
  );
  const studentTypes = [...schema.matchAll(/type Student\w* \{[^}]*\}/g)]
    .map(([definition]) => definition)
    .filter((definition) => !definition.startsWith('type StudentReleased'));
  const adminTypes = [...schema.matchAll(/type Admin\w* \{[^}]*\}/g)].map(
    ([definition]) => definition,
  );

  assert.doesNotMatch(studentTypes.join('\n'), /isCorrect|correctOptionId/);
  assert.match(schema, /studentReleasedAttemptResult/);
  assert.match(
    schema,
    /type StudentReleasedResultAnswer \{[^}]*correctAnswer:[^}]*isCorrect:/s,
  );
  assert.doesNotMatch(
    adminTypes.join('\n'),
    /selectedOption|correctOption|isCorrect/,
  );
  assert.doesNotMatch(schema, /AuthAccount|providerAccountId/);
  assert.doesNotMatch(
    schema,
    /TransferRequest|requestStudentTransfer|reviewStudentTransfer|transferRequests/,
  );
  assert.match(schema, /startTestAttempt/);
  assert.match(schema, /studentAvailableTests/);
  assert.match(schema, /createMediaUploadIntent/);
  assert.match(schema, /confirmMediaUpload/);
  assert.match(schema, /createLibraryItem/);
  assert.match(schema, /studentLibraryItems/);
  assert.match(schema, /studentProgress/);
  assert.match(schema, /teacherGroupProgress/);
  assert.match(schema, /teacherAttemptReview/);
  for (const removedOperation of [
    'adminAcademicOverview',
    'adminAttendance',
    'adminAuditLogs',
    'adminGroupProgresses',
    'adminLibraryItems',
    'adminLocations',
    'adminMediaObjects',
    'adminRejectMediaObject',
    'adminSetLibraryItemArchived',
    'adminStudentResults',
    'adminStudents',
    'adminTest',
    'adminTests',
  ]) {
    assert.doesNotMatch(schema, new RegExp(`\b${removedOperation}\b`));
  }
  for (const operation of [
    'beginCredentialLogin',
    'verifyCredentialLogin',
    'resendCredentialLoginCode',
    'adminProvisionUser',
    'myProfile',
    'adminUsers',
    'updateMyProfile',
    'teacherGroups',
    'updateTeacherGroup',
    'teacherGroupRoster',
    'teacherTestPapers',
    'teacherTests',
    'createTestDraft',
    'publishTestVersion',
    'grantAdditionalTestAttempt',
    'teacherSchedule',
    'studentSchedule',
    'recordLessonAttendance',
    'teacherGroupMaterials',
    'studentAssignments',
    'submitAssignment',
    'reviewAssignmentSubmission',
    'publicCourses',
    'publicEvents',
    'registerForCourse',
    'submitContactRequest',
    'submitExamRegistration',
    'registerForEvent',
    'teacherDashboard',
    'myNotifications',
    'adminOperationalOverview',
  ]) {
    assert.match(schema, new RegExp(operation));
  }
});

async function uploadAndConfirmPdf(
  originalName: string,
  pdf: Buffer,
): Promise<string> {
  const created = await executeGraphql(
    teacherToken,
    `mutation CreateLibraryUpload($input: CreateMediaUploadIntentInput!) {
      createMediaUploadIntent(input: $input) {
        uploadIntent { mediaObjectId url requiredHeaders { name value } }
      }
    }`,
    {
      input: {
        mimeType: 'application/pdf',
        originalName,
        sizeBytes: pdf.byteLength,
      },
    },
  );
  const intent = requireRecordField(
    requireRecordField(created, 'createMediaUploadIntent'),
    'uploadIntent',
  );
  const mediaObjectId = requireStringField(intent, 'mediaObjectId');
  const upload = await fetch(requireStringField(intent, 'url'), {
    body: new Uint8Array(pdf),
    headers: requireUploadHeaders(intent),
    method: 'PUT',
  });
  assert.equal(upload.status, 200);
  const confirmed = await executeGraphql(
    teacherToken,
    `mutation ConfirmLibraryUpload($input: MediaObjectReferenceInput!) {
      confirmMediaUpload(input: $input) {
        mediaObject { id malwareStatus status }
      }
    }`,
    { input: { mediaObjectId } },
  );
  const mediaObject = requireRecordField(
    requireRecordField(confirmed, 'confirmMediaUpload'),
    'mediaObject',
  );
  assert.equal(mediaObject.malwareStatus, 'CLEAN');
  assert.equal(mediaObject.status, 'READY');
  return mediaObjectId;
}

async function createStudentProgressFixture(
  database: DatabaseService,
  fixtureTeacherId: string,
): Promise<{
  groupId: string;
  groupName: string;
  reviewAttemptId: string;
  studentId: string;
}> {
  const studentId = randomUUID();
  const fixtureGroupId = randomUUID();
  const groupName = `Progress Group ${fixtureGroupId}`;
  const membershipId = randomUUID();
  const categoryId = randomUUID();

  await database.user.create({
    data: {
      displayName: 'Progress Student',
      id: studentId,
      role: UserRole.STUDENT,
    },
  });
  await database.group.create({
    data: {
      id: fixtureGroupId,
      name: groupName,
      slug: `progress-${fixtureGroupId}`,
      paymentDeadlineDay: 15,
      teacherId: fixtureTeacherId,
    },
  });
  await database.groupMembership.create({
    data: { groupId: fixtureGroupId, id: membershipId, studentId },
  });
  await database.testCategory.create({
    data: {
      id: categoryId,
      name: `Progress ${categoryId}`,
      teacherId: fixtureTeacherId,
    },
  });

  const passedTest = await createPublishedProgressTest(
    database,
    fixtureGroupId,
    categoryId,
    'Passed test',
  );
  const awaitingTest = await createPublishedProgressTest(
    database,
    fixtureGroupId,
    categoryId,
    'Awaiting test',
  );
  await createPublishedProgressTest(
    database,
    fixtureGroupId,
    categoryId,
    'Remaining test',
  );
  const failedTest = await createPublishedProgressTest(
    database,
    fixtureGroupId,
    categoryId,
    'Failed test',
  );
  await createPublishedProgressTest(
    database,
    fixtureGroupId,
    categoryId,
    'Future test',
    new Date(Date.now() + 86_400_000),
  );

  const submittedAt = new Date();
  const reviewAttemptId = randomUUID();
  await database.attempt.createMany({
    data: [
      scoredAttemptData({
        attemptNumber: 1,
        correctAnswerCount: 4,
        groupMembershipId: membershipId,
        passed: false,
        percentage: 40,
        studentId,
        submittedAt,
        testVersionId: passedTest.versionId,
      }),
      {
        attemptNumber: 1,
        groupMembershipId: membershipId,
        id: randomUUID(),
        status: AttemptStatus.SUBMITTED,
        studentId,
        submissionReason: AttemptSubmissionReason.MANUAL,
        submittedAt,
        testVersionId: awaitingTest.versionId,
      },
      scoredAttemptData({
        attemptNumber: 1,
        correctAnswerCount: 1,
        groupMembershipId: membershipId,
        passed: false,
        percentage: 50,
        studentId,
        submittedAt,
        testVersionId: failedTest.versionId,
        totalQuestionCount: 2,
      }),
    ],
  });
  await database.attempt.create({
    data: {
      attemptNumber: 2,
      groupMembershipId: membershipId,
      id: reviewAttemptId,
      studentId,
      testVersionId: passedTest.versionId,
    },
  });
  await database.attemptAnswer.create({
    data: {
      attemptId: reviewAttemptId,
      questionId: passedTest.questionId,
      selectedOptionId: passedTest.correctOptionId,
    },
  });
  await database.attempt.update({
    where: { id: reviewAttemptId },
    data: {
      status: AttemptStatus.SUBMITTED,
      submissionReason: AttemptSubmissionReason.MANUAL,
      submittedAt,
    },
  });
  await database.attempt.update({
    where: { id: reviewAttemptId },
    data: {
      correctAnswerCount: 8,
      passed: true,
      passingPercentage: 60,
      percentage: 80,
      scoringRuleVersion: 'single-choice-v1',
      status: AttemptStatus.SCORED,
      totalQuestionCount: 10,
    },
  });

  return {
    groupId: fixtureGroupId,
    groupName,
    reviewAttemptId,
    studentId,
  };
}

interface ScoredAttemptFixtureInput {
  readonly attemptNumber: number;
  readonly correctAnswerCount: number;
  readonly groupMembershipId: string;
  readonly id?: string;
  readonly passed: boolean;
  readonly percentage: number;
  readonly studentId: string;
  readonly submittedAt: Date;
  readonly testVersionId: string;
  readonly totalQuestionCount?: number;
}

function scoredAttemptData(input: ScoredAttemptFixtureInput) {
  return {
    attemptNumber: input.attemptNumber,
    correctAnswerCount: input.correctAnswerCount,
    groupMembershipId: input.groupMembershipId,
    id: input.id ?? randomUUID(),
    passed: input.passed,
    passingPercentage: 60,
    percentage: input.percentage,
    scoringRuleVersion: 'single-choice-v1',
    status: AttemptStatus.SCORED,
    studentId: input.studentId,
    submissionReason: AttemptSubmissionReason.MANUAL,
    submittedAt: input.submittedAt,
    testVersionId: input.testVersionId,
    totalQuestionCount: input.totalQuestionCount ?? 10,
  };
}

async function createPublishedProgressTest(
  database: DatabaseService,
  fixtureGroupId: string,
  categoryId: string,
  title: string,
  availabilityStartsAt?: Date,
): Promise<{
  correctOptionId: string;
  questionId: string;
  testId: string;
  versionId: string;
}> {
  const fixtureTestId = randomUUID();
  const versionId = randomUUID();
  const sectionId = randomUUID();
  const questionId = randomUUID();
  const correctOptionId = randomUUID();
  const wrongOptionId = randomUUID();

  await database.test.create({
    data: { categoryId, groupId: fixtureGroupId, id: fixtureTestId },
  });
  await database.testVersion.create({
    data: {
      attemptLimit: 2,
      ...(availabilityStartsAt === undefined ? {} : { availabilityStartsAt }),
      id: versionId,
      primaryLanguage: Language.UZ,
      testId: fixtureTestId,
      version: 1,
    },
  });
  await database.testTranslation.create({
    data: { language: Language.UZ, testVersionId: versionId, title },
  });
  await database.testSection.create({
    data: {
      id: sectionId,
      position: 1,
      testVersionId: versionId,
      translations: {
        create: {
          instructions: 'Choose the correct option.',
          language: Language.UZ,
          title: 'Fake section',
        },
      },
    },
  });
  await database.question.create({
    data: {
      id: questionId,
      position: 1,
      sectionId,
      testVersionId: versionId,
    },
  });
  await database.questionTranslation.create({
    data: {
      language: Language.UZ,
      prompt: `${title} question`,
      questionId,
    },
  });
  await database.answerOption.createMany({
    data: [
      { id: correctOptionId, isCorrect: true, position: 1, questionId },
      { id: wrongOptionId, isCorrect: false, position: 2, questionId },
    ],
  });
  await database.answerOptionTranslation.createMany({
    data: [
      {
        answerOptionId: correctOptionId,
        language: Language.UZ,
        text: 'Correct',
      },
      {
        answerOptionId: wrongOptionId,
        language: Language.UZ,
        text: 'Wrong',
      },
    ],
  });
  await database.testVersion.update({
    where: { id: versionId },
    data: {
      publishedAt: new Date(),
      status: TestVersionStatus.PUBLISHED,
    },
  });

  return { correctOptionId, questionId, testId: fixtureTestId, versionId };
}

async function createStudentTestFixture(database: DatabaseService): Promise<{
  groupId: string;
  mediaObjectId: string;
  studentId: string;
  teacherId: string;
  testId: string;
}> {
  const teacherId = randomUUID();
  const studentId = randomUUID();
  const groupId = randomUUID();
  const membershipId = randomUUID();
  const categoryId = randomUUID();
  const fixtureTestId = randomUUID();
  const versionId = randomUUID();
  const sectionId = randomUUID();
  const questionId = randomUUID();
  const correctOptionId = randomUUID();
  const wrongOptionId = randomUUID();
  const mediaObjectId = randomUUID();

  await database.user.createMany({
    data: [
      { displayName: 'Fake Teacher', id: teacherId, role: UserRole.TEACHER },
      { displayName: 'Fake Student', id: studentId, role: UserRole.STUDENT },
    ],
  });
  await database.group.create({
    data: {
      id: groupId,
      category: GroupCategory.IELTS,
      name: 'Fake GraphQL Group',
      slug: `graphql-${groupId}`,
      paymentDeadlineDay: 10,
      teacherId,
    },
  });
  await database.groupMembership.create({
    data: { groupId, id: membershipId, studentId },
  });
  await database.testCategory.create({
    data: { id: categoryId, name: 'Grammar', teacherId },
  });
  await database.test.create({
    data: { categoryId, groupId, id: fixtureTestId },
  });
  await database.testVersion.create({
    data: {
      attemptLimit: 1,
      id: versionId,
      passingPercentage: 60,
      primaryLanguage: Language.UZ,
      testId: fixtureTestId,
      version: 1,
    },
  });
  await database.testTranslation.create({
    data: {
      language: Language.UZ,
      testVersionId: versionId,
      title: 'Fake Grammar Test',
    },
  });
  const mediaLifecycleTime = new Date();
  await database.mediaObject.create({
    data: {
      bucket: 'integration-media',
      checksumSha256: createHash('sha256')
        .update('reserved listening fixture')
        .digest('hex'),
      createdById: teacherId,
      createdAt: mediaLifecycleTime,
      id: mediaObjectId,
      malwareEngine: 'reserved-integration-scanner',
      malwareEngineVersion: '1.0',
      malwareScannedAt: new Date(),
      malwareSignatureVersion: 'reserved-signatures-1',
      malwareStatus: MediaMalwareStatus.CLEAN,
      mediaType: MediaType.AUDIO,
      mimeType: 'audio/wav',
      objectKey: `integration/listening/${mediaObjectId}.wav`,
      originalName: 'reserved-listening.wav',
      sizeBytes: 24n,
      status: MediaObjectStatus.READY,
      verifiedAt: mediaLifecycleTime,
    },
  });
  await database.testSection.create({
    data: {
      id: sectionId,
      mediaObjectId,
      position: 1,
      testVersionId: versionId,
      translations: {
        create: {
          instructions: 'Choose the correct option.',
          language: Language.UZ,
          title: 'Fake section',
        },
      },
    },
  });
  await database.testSectionBlock.create({
    data: {
      kind: TestSectionBlockKind.TABLE,
      position: 1,
      tablePayload: {
        headerRows: [],
        rows: [
          ['Name', 'Reserved learner'],
          ['Reference', '{{1}}'],
        ],
        version: 1,
      },
      testSectionId: sectionId,
      translations: {
        create: {
          caption: 'Reserved phone interview',
          language: Language.UZ,
        },
      },
    },
  });
  await database.question.create({
    data: {
      id: questionId,
      position: 1,
      sectionId,
      testVersionId: versionId,
    },
  });
  await database.questionTranslation.create({
    data: {
      language: Language.UZ,
      prompt: 'Correct optionni tanlang',
      questionId,
    },
  });
  await database.answerOption.createMany({
    data: [
      {
        id: correctOptionId,
        isCorrect: true,
        position: 1,
        questionId,
      },
      {
        id: wrongOptionId,
        isCorrect: false,
        position: 2,
        questionId,
      },
    ],
  });
  await database.answerOptionTranslation.createMany({
    data: [
      {
        answerOptionId: correctOptionId,
        language: Language.UZ,
        text: 'Correct',
      },
      {
        answerOptionId: wrongOptionId,
        language: Language.UZ,
        text: 'Wrong',
      },
    ],
  });
  await database.testVersion.update({
    where: { id: versionId },
    data: {
      publishedAt: new Date(),
      status: TestVersionStatus.PUBLISHED,
    },
  });

  return {
    groupId,
    mediaObjectId,
    studentId,
    teacherId,
    testId: fixtureTestId,
  };
}

async function executeGraphql(
  token: string | undefined,
  query: string,
  variables?: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const response = await executeGraphqlExpectingErrors(token, query, variables);

  if ('errors' in response) {
    throw new Error(
      `GraphQL request failed: ${JSON.stringify(response.errors)}`,
    );
  }

  return requireRecordField(response, 'data');
}

async function executeGraphqlExpectingErrors(
  token: string | undefined,
  query: string,
  variables?: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const response = await fetch(apiUrl, {
    body: JSON.stringify({ query, variables }),
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    method: 'POST',
  });
  const body: unknown = await response.json();

  return requireRecord(body, 'GraphQL response');
}

async function applyMigrations(connectionString: string): Promise<void> {
  const migrationPool = new Pool({ connectionString });

  try {
    for (const migrationName of [
      '20260901000000_initial_domain_schema',
      '20260901010000_auth_identity_accounts',
      '20260901020000_scoring_outbox',
      '20260901030000_media_object_lifecycle',
      '20260901031000_media_object_updated_at_default',
      '20260901040000_media_malware_scan',
      '20260901041000_fix_media_attachment_trigger',
      '20260904010000_user_profiles',
      '20260904020000_groups_memberships_transfers',
      '20260904030000_learning_public_notifications',
      '20260904040000_vocabulary_import_pilot',
      '20260905090000_public_website_content',
      '20260907010000_credential_email_code_login',
      '20260915010000_teacher_group_category',
      '20260915020000_teacher_group_soft_delete',
      '20260915021000_teacher_group_deleted_archive_constraint',
      '20260916010000_group_membership_participation_status',
      '20260916020000_credential_refresh_sessions',
      '20260923010000_teacher_student_soft_delete',
      '20260923020000_teacher_lesson_plans',
      '20260923030000_media_archive_type',
      '20260923040000_best_lc_academic_tests',
      '20260923041000_best_lc_academic_publish_rules',
      '20260926010000_teacher_practice_catalog',
      '20260927010000_speaking_attempt_persistence',
      '20260928010000_ielts_test_authoring_blocks',
      '20260928020000_ielts_blocks_publish_immutability',
      '20260928030000_easyielts_test_import',
      '20260928040000_gemini_test_generation',
      '20260928050000_gemini_single_skill_generation',
      '20260928060000_remove_ai_test_generation',
      '20260929010000_teacher_practice_soft_delete',
      '20260929020000_teacher_finance_snapshots',
      '20260930010000_accepted_answer_display_value',
      '20260930011000_accepted_answer_display_value_version_backfill',
      '20261008010000_user_name_fields',
      '20261011020000_admin_salary_statements',
      '20261011160000_admin_request_soft_delete',
      '20261012010000_admin_message_soft_delete',
      '20261012150000_admin_course_soft_delete',
      '20261012160000_admin_exam_soft_delete',
      '20261012170000_admin_event_soft_delete',
    ]) {
      const sql = await readFile(
        resolve(
          __dirname,
          `../../../packages/database/prisma/migrations/${migrationName}/migration.sql`,
        ),
        'utf8',
      );
      await migrationPool.query(sql);
    }
  } finally {
    await migrationPool.end();
  }
}

interface FakeStoredObject {
  readonly body: Buffer;
  readonly contentType: string;
  readonly etag: string;
  readonly lastModified: Date;
}

function createFakeWav(): Buffer {
  const sampleRate = 8_000;
  const channelCount = 1;
  const bitsPerSample = 16;
  const dataLength = 1_600;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channelCount, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE((sampleRate * channelCount * bitsPerSample) / 8, 28);
  wav.writeUInt16LE((channelCount * bitsPerSample) / 8, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataLength, 40);
  return wav;
}

function createFakeStorageServer(): Server {
  const objects = new Map<string, FakeStoredObject>();

  return createHttpServer((request, response) => {
    void handleFakeStorageRequest(objects, request, response).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500);
      }

      response.end();
    });
  });
}

async function handleFakeStorageRequest(
  objects: Map<string, FakeStoredObject>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
  const key = requestUrl.pathname;
  const stored = objects.get(key);

  if (request.method === 'PUT') {
    if (request.headers['if-none-match'] !== '*') {
      response.writeHead(400);
      response.end();
      return;
    }

    if (stored !== undefined) {
      response.writeHead(412);
      response.end();
      return;
    }

    const body = await readRequestBody(request);
    const declaredLength = Number(request.headers['content-length']);
    const contentType = request.headers['content-type'];

    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength !== body.byteLength ||
      typeof contentType !== 'string'
    ) {
      response.writeHead(400);
      response.end();
      return;
    }

    const etag = `"${createHash('md5').update(body).digest('hex')}"`;
    objects.set(key, { body, contentType, etag, lastModified: new Date() });
    response.setHeader('etag', etag);
    response.writeHead(200);
    response.end();
    return;
  }

  if (stored === undefined) {
    response.writeHead(404);
    response.end();
    return;
  }

  response.setHeader('content-length', stored.body.byteLength);
  response.setHeader('content-type', stored.contentType);
  response.setHeader('etag', stored.etag);
  response.setHeader('last-modified', stored.lastModified.toUTCString());

  if (request.method === 'HEAD') {
    response.writeHead(200);
    response.end();
    return;
  }

  if (request.method === 'GET') {
    const ifMatch = request.headers['if-match'];

    if (ifMatch !== undefined && ifMatch !== stored.etag) {
      response.writeHead(412);
      response.end();
      return;
    }

    response.writeHead(200);
    response.end(stored.body);
    return;
  }

  response.writeHead(405);
  response.end();
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: unknown) => {
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else {
        rejectBody(new Error('Fake storage received an invalid body chunk'));
      }
    });
    request.on('end', () => {
      resolveBody(Buffer.concat(chunks));
    });
    request.on('error', rejectBody);
  });
}

function requireUploadHeaders(
  intent: Readonly<Record<string, unknown>>,
): Headers {
  const headers = new Headers();

  for (const value of requireArrayField(intent, 'requiredHeaders')) {
    const header = requireRecord(value, 'upload header');
    headers.set(
      requireStringField(header, 'name'),
      requireStringField(header, 'value'),
    );
  }

  return headers;
}

function listen(server: Server | TcpServer): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
}

function closeServer(server: Server | TcpServer | undefined): Promise<void> {
  if (!server?.listening) {
    return Promise.resolve();
  }

  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) {
        resolveClose();
      } else {
        rejectClose(error);
      }
    });
  });
}

function configureFakeStorage(server: Server): void {
  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('Fake storage did not bind to a TCP port');
  }

  const port = address.port;
  process.env.S3_ACCESS_KEY_ID = 'fake-access-key';
  process.env.S3_BUCKET = 'best-private';
  process.env.S3_DOWNLOAD_URL_TTL_SECONDS = '300';
  process.env.S3_ENDPOINT = `http://127.0.0.1:${String(port)}`;
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.S3_MAX_UPLOAD_BYTES = '52428800';
  process.env.S3_REGION = 'us-east-1';
  process.env.S3_SECRET_ACCESS_KEY = 'fake-secret-key-with-enough-length';
  process.env.S3_UPLOAD_URL_TTL_SECONDS = '300';
}

function createFakeMalwareScannerServer(): TcpServer {
  return createTcpServer((socket) => {
    handleFakeMalwareScannerConnection(socket);
  });
}

function handleFakeMalwareScannerConnection(socket: Socket): void {
  let received = Buffer.alloc(0);

  socket.on('data', (chunk: Buffer) => {
    received = Buffer.concat([received, chunk]);

    if (received.subarray(0, 8).toString('utf8') === 'zVERSION') {
      if (received.includes(0)) {
        socket.end('ClamAV 1.5.3/99999/Tue Sep 01 00:00:00 2026\0');
      }

      return;
    }

    const commandLength = Buffer.byteLength('zINSTREAM\0');

    if (
      received.byteLength < commandLength ||
      received.subarray(0, commandLength).toString('utf8') !== 'zINSTREAM\0'
    ) {
      return;
    }

    const payloadChunks: Buffer[] = [];
    let offset = commandLength;

    while (offset + 4 <= received.byteLength) {
      const length = received.readUInt32BE(offset);
      offset += 4;

      if (length === 0) {
        const payload = Buffer.concat(payloadChunks);
        const reply = payload.includes('FAKE-MALWARE-MARKER')
          ? 'stream: Test-Malware FOUND\0'
          : 'stream: OK\0';
        socket.end(reply);
        return;
      }

      if (offset + length > received.byteLength) {
        return;
      }

      payloadChunks.push(received.subarray(offset, offset + length));
      offset += length;
    }
  });
}

function configureFakeMalwareScanner(server: TcpServer): void {
  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('Fake malware scanner did not bind to a TCP port');
  }

  process.env.CLAMAV_CONNECT_TIMEOUT_MS = '1000';
  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = String(address.port);
  process.env.CLAMAV_SCAN_TIMEOUT_MS = '2000';
}

function captureRuntimeEnvironment(): ReadonlyMap<string, string | undefined> {
  return new Map(
    RUNTIME_ENVIRONMENT_NAMES.map((name) => [name, process.env[name]]),
  );
}

function restoreRuntimeEnvironment(
  original: ReadonlyMap<string, string | undefined>,
): void {
  for (const [name, value] of original) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, name);
    } else {
      process.env[name] = value;
    }
  }
}

function createTestDatabaseUrl(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  url.searchParams.delete('options');
  url.searchParams.set('schema', 'public');
  return url.toString();
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireApp(): INestApplication {
  if (app === undefined) {
    throw new Error('Test application was not initialized');
  }

  return app;
}

function requireDefined<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`${name} must be defined`);
  }

  return value;
}

function requireRecordField(
  record: Readonly<Record<string, unknown>>,
  field: string,
): Record<string, unknown> {
  return requireRecord(record[field], field);
}

function requireArrayField(
  record: Readonly<Record<string, unknown>>,
  field: string,
): unknown[] {
  const value = record[field];

  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }

  return value;
}

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const value = record[field];

  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  return value;
}


void test('Admin operations: group save, conflict, soft deletion and audit', async () => {
  const input = {
    teacherId,
    name: 'Integration admin group',
    slug: 'admin-ops-' + randomUUID(),
    category: 'CEFR',
    room: 'Reserved admin room',
    scheduleDays: [7],
    startsAtMinutes: 1260,
    endsAtMinutes: 1320,
    monthlyTuitionUzs: '300000',
  };
  const save = `mutation($input:AdminSaveGroupInput!){adminSaveGroup(input:$input){id status updatedAt}}`;
  await assert.rejects(executeGraphql(teacherToken, save, { input }));
  const created = await executeGraphql(adminToken, save, { input });
  const row = requireRecordField(created, 'adminSaveGroup');
  const id = String(row.id);
  await assert.rejects(
    executeGraphql(adminToken, save, {
      input: { ...input, slug: 'collision-' + randomUUID() },
    }),
  );
  const updated = await executeGraphql(adminToken, save, {
    input: {
      ...input,
      groupId: id,
      expectedUpdatedAt: row.updatedAt,
      name: 'Updated admin group',
    },
  });
  assert.ok(!updated.errors);
  const deleted = await executeGraphql(
    adminToken,
    `mutation($id:ID!){adminSetGroupStatus(groupId:$id,status:"DELETED"){status}}`,
    { id },
  );
  assert.equal(
    requireRecordField(deleted, 'adminSetGroupStatus').status,
    'DELETED',
  );
  const db = requireEditorialApp().get(DatabaseService);
  assert.equal(
    (await db.group.findUniqueOrThrow({ where: { id } })).status,
    'DELETED',
  );
  assert.equal(
    await db.auditLog.count({ where: { targetId: id, targetType: 'GROUP' } }),
    3,
  );
});




void test('Admin operations: settings profile persists with audit', async () => {
  const result = await executeGraphql(
    adminToken,
    `mutation($input:UpdateMyProfileInput!){updateMyProfile(input:$input){profile{displayName phone preferredLanguage}}}`,
    {
      input: {
        displayName: 'Reserved Admin',
        phone: '+998000000000',
        preferredLanguage: 'UZ',
      },
    },
  );
  const profile = requireRecordField(
    requireRecordField(result, 'updateMyProfile'),
    'profile',
  );
  assert.equal(profile.preferredLanguage, 'UZ');
  const db = requireEditorialApp().get(DatabaseService);
  const row = await db.user.findUniqueOrThrow({ where: { id: adminId } });
  assert.equal(row.displayName, 'Reserved Admin');
  assert.equal(row.phone, '+998000000000');
  assert.ok(
    await db.auditLog.count({
      where: { actorId: adminId, action: 'USER_PROFILE_UPDATED' },
    }),
  );
});





function requireEditorialArray(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}

function requireEditorialApp(): INestApplication {
  assert.ok(app);
  return app;
}
