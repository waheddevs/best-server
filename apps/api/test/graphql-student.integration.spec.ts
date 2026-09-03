import assert from 'node:assert/strict';
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

import { loadInfrastructureEnvironment } from '@best/config';
import {
  AttemptStatus,
  AttemptSubmissionReason,
  Language,
  TestVersionStatus,
  UserRole,
} from '@best/database';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/components/auth/auth.service';
import { DatabaseService } from '../src/database/database.service';

const RUNTIME_ENVIRONMENT_NAMES = [
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
let adminToken: string;
let studentToken: string;
let teacherToken: string;
let testId: string;
let groupId: string;
let teacherId: string;

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

  app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  apiUrl = `${await app.getUrl()}/graphql`;

  const database = app.get(DatabaseService);
  const authService = app.get(AuthService);
  const fixture = await createStudentTestFixture(database);
  const adminId = randomUUID();
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
  assert.equal(await requireApp().get(DatabaseService).attempt.count(), 0);

  const started = await executeGraphql(
    studentToken,
    `mutation StartAttempt($input: StartTestAttemptInput!) {
      startTestAttempt(input: $input) {
        attempt {
          id status title questions { id prompt options { id text } }
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
  const question = requireRecord(
    requireArrayField(startedAttempt, 'questions')[0],
    'question',
  );
  const option = requireRecord(
    requireArrayField(question, 'options')[0],
    'option',
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

void test('Admin can monitor academic aggregates and Student scores only', async () => {
  const database = requireApp().get(DatabaseService);
  const fixture = await createStudentProgressFixture(database, teacherId);
  const overviewResponse = await executeGraphql(
    adminToken,
    `query AdminAcademicOverview {
      adminAcademicOverview {
        activeTeacherCount activeStudentCount activeGroupCount assignedTestCount
        totalAssignmentCount completedAssignmentCount remainingAssignmentCount
        awaitingScoreAssignmentCount scoredAssignmentCount
        passedAssignmentCount failedAssignmentCount completionPercentage
        averagePercentage highestPercentage lowestPercentage
      }
    }`,
  );
  const overview = requireRecordField(
    overviewResponse,
    'adminAcademicOverview',
  );
  assert.equal(Number(overview.activeTeacherCount) >= 1, true);
  assert.equal(Number(overview.activeStudentCount) >= 1, true);
  assert.equal(Number(overview.activeGroupCount) >= 1, true);
  assert.equal(Number(overview.assignedTestCount) >= 4, true);
  assert.equal(
    overview.remainingAssignmentCount,
    Number(overview.totalAssignmentCount) -
      Number(overview.completedAssignmentCount),
  );
  assert.equal(Number(overview.highestPercentage) >= 80, true);
  assert.equal(Number(overview.lowestPercentage) <= 50, true);

  const groupsResponse = await executeGraphql(
    adminToken,
    `query AdminGroupProgresses {
      adminGroupProgresses(first: 100) {
        edges {
          node {
            groupId groupName groupStatus teacherId teacherDisplayName
            activeStudentCount assignedTestCount totalAssignmentCount
            completedAssignmentCount remainingAssignmentCount
            awaitingScoreAssignmentCount scoredAssignmentCount
            passedAssignmentCount failedAssignmentCount completionPercentage
            averagePercentage highestPercentage lowestPercentage
          }
        }
        pageInfo { hasNextPage }
      }
    }`,
  );
  const groupEdges = requireArrayField(
    requireRecordField(groupsResponse, 'adminGroupProgresses'),
    'edges',
  );
  const fixtureGroup = requireRecord(
    groupEdges
      .map((edge) =>
        requireRecordField(requireRecord(edge, 'admin group edge'), 'node'),
      )
      .find(
        ({ groupId: candidateGroupId }) => candidateGroupId === fixture.groupId,
      ),
    'fixture admin group',
  );
  assert.equal(fixtureGroup.teacherId, teacherId);
  assert.equal(fixtureGroup.groupStatus, 'ACTIVE');
  assert.equal(fixtureGroup.activeStudentCount, 1);
  assert.equal(fixtureGroup.assignedTestCount, 4);
  assert.equal(fixtureGroup.completedAssignmentCount, 3);
  assert.equal(fixtureGroup.completionPercentage, 75);
  assert.equal(fixtureGroup.averagePercentage, 65);
  assert.equal(fixtureGroup.highestPercentage, 80);
  assert.equal(fixtureGroup.lowestPercentage, 50);

  const studentsResponse = await executeGraphql(
    adminToken,
    `query AdminStudents {
      adminStudents(first: 100) {
        edges {
          node {
            studentId displayName status currentGroupId currentGroupName
            scoredAttemptCount scoredTestCount passedTestCount failedTestCount
            averagePercentage highestPercentage lowestPercentage latestResultAt
          }
        }
        pageInfo { hasNextPage }
      }
    }`,
  );
  const studentEdges = requireArrayField(
    requireRecordField(studentsResponse, 'adminStudents'),
    'edges',
  );
  const fixtureStudent = requireRecord(
    studentEdges
      .map((edge) =>
        requireRecordField(requireRecord(edge, 'admin student edge'), 'node'),
      )
      .find(
        ({ studentId: candidateStudentId }) =>
          candidateStudentId === fixture.studentId,
      ),
    'fixture admin student',
  );
  assert.equal(fixtureStudent.status, 'ACTIVE');
  assert.equal(fixtureStudent.currentGroupId, fixture.groupId);
  assert.equal(fixtureStudent.scoredAttemptCount, 3);
  assert.equal(fixtureStudent.scoredTestCount, 2);
  assert.equal(fixtureStudent.passedTestCount, 1);
  assert.equal(fixtureStudent.failedTestCount, 1);
  assert.equal(fixtureStudent.averagePercentage, 65);
  assert.equal(fixtureStudent.highestPercentage, 80);
  assert.equal(fixtureStudent.lowestPercentage, 50);
  assert.equal(typeof fixtureStudent.latestResultAt, 'string');

  const resultsResponse = await executeGraphql(
    adminToken,
    `query AdminStudentResults($studentId: ID!, $language: Language!) {
      adminStudentResults(studentId: $studentId, language: $language) {
        edges {
          node {
            attemptId testId title groupId groupName attemptNumber
            correctAnswerCount totalQuestionCount percentage
            highestPercentage passed submittedAt
          }
        }
      }
    }`,
    { language: 'UZ', studentId: fixture.studentId },
  );
  const resultEdges = requireArrayField(
    requireRecordField(resultsResponse, 'adminStudentResults'),
    'edges',
  );
  assert.equal(resultEdges.length, 3);
  assert.equal(
    resultEdges.every((edge) => {
      const node = requireRecordField(
        requireRecord(edge, 'admin result edge'),
        'node',
      );
      return node.groupId === fixture.groupId;
    }),
    true,
  );

  const forbiddenReview = await executeGraphqlExpectingErrors(
    adminToken,
    `query AdminCannotReviewAnswers($attemptId: ID!) {
      teacherAttemptReview(attemptId: $attemptId, language: UZ) { attemptId }
    }`,
    { attemptId: fixture.reviewAttemptId },
  );
  const reviewError = requireRecord(
    requireArrayField(forbiddenReview, 'errors')[0],
    'admin review error',
  );
  assert.equal(requireRecordField(reviewError, 'extensions').code, 'FORBIDDEN');
});

void test('Teacher and Student roles cannot call Admin academic operations', async () => {
  for (const token of [teacherToken, studentToken]) {
    const response = await executeGraphqlExpectingErrors(
      token,
      `query NonAdminCannotReadOverview {
        adminAcademicOverview { activeStudentCount }
      }`,
    );
    const firstError = requireRecord(
      requireArrayField(response, 'errors')[0],
      'admin authorization error',
    );
    assert.equal(
      requireRecordField(firstError, 'extensions').code,
      'FORBIDDEN',
    );
  }
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

void test('generated schema keeps answer review out of Student and Admin types', async () => {
  const schema = await readFile(
    resolve(__dirname, '../../../packages/graphql/schema.graphql'),
    'utf8',
  );
  const studentTypes = [...schema.matchAll(/type Student\w* \{[^}]*\}/g)].map(
    ([definition]) => definition,
  );
  const adminTypes = [...schema.matchAll(/type Admin\w* \{[^}]*\}/g)].map(
    ([definition]) => definition,
  );

  assert.doesNotMatch(studentTypes.join('\n'), /isCorrect|correctOptionId/);
  assert.doesNotMatch(
    adminTypes.join('\n'),
    /selectedOption|correctOption|isCorrect/,
  );
  assert.doesNotMatch(schema, /AuthAccount|providerAccountId/);
  assert.match(schema, /startTestAttempt/);
  assert.match(schema, /studentAvailableTests/);
  assert.match(schema, /createMediaUploadIntent/);
  assert.match(schema, /confirmMediaUpload/);
  assert.match(schema, /createLibraryItem/);
  assert.match(schema, /studentLibraryItems/);
  assert.match(schema, /studentProgress/);
  assert.match(schema, /teacherGroupProgress/);
  assert.match(schema, /teacherAttemptReview/);
  assert.match(schema, /adminAcademicOverview/);
  assert.match(schema, /adminGroupProgresses/);
  assert.match(schema, /adminStudents/);
  assert.match(schema, /adminStudentResults/);
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
  await database.question.create({
    data: { id: questionId, position: 1, testVersionId: versionId },
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
  const questionId = randomUUID();
  const correctOptionId = randomUUID();
  const wrongOptionId = randomUUID();

  await database.user.createMany({
    data: [
      { displayName: 'Fake Teacher', id: teacherId, role: UserRole.TEACHER },
      { displayName: 'Fake Student', id: studentId, role: UserRole.STUDENT },
    ],
  });
  await database.group.create({
    data: {
      id: groupId,
      name: 'Fake GraphQL Group',
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
  await database.question.create({
    data: { id: questionId, position: 1, testVersionId: versionId },
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

  return { groupId, studentId, teacherId, testId: fixtureTestId };
}

async function executeGraphql(
  token: string,
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
  token: string,
  query: string,
  variables?: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const response = await fetch(apiUrl, {
    body: JSON.stringify({ query, variables }),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
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
