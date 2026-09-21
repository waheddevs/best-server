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
  AssignmentStatus,
  AttemptStatus,
  AttemptSubmissionReason,
  GroupMembershipStatus,
  Language,
  LibraryVisibility,
  PublicContentStatus,
  PublicCourseAccent,
  PublicCourseCategory,
  PublicEventTimelineStatus,
  TestVersionStatus,
  UserRole,
} from '@best/database';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/components/auth/auth.service';
import { CREDENTIAL_EMAIL_SENDER } from '../src/components/auth/auth.constants';
import type {
  CredentialEmailSender,
  CredentialLoginCodeMessage,
} from '../src/components/auth/credential-email-sender.type';
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
let adminToken: string;
let studentToken: string;
let teacherToken: string;
let testId: string;
let groupId: string;
let teacherId: string;
const credentialEmailSender = new CapturingCredentialEmailSender();

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
    .compile();
  app = testingModule.createNestApplication({ abortOnError: false });
  app.useLogger(false);
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
          id scheduleDays startsAtMinutes endsAtMinutes activeStudentCount monthlyTuitionUzs
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

  const sourceGroup = await database.group.create({
    data: {
      category: 'CEFR',
      name: `Reserved transfer source ${suffix}`,
      slug: `reserved-transfer-source-${suffix}`,
      teacherId,
    },
  });
  const transferStudentId = studentIds[15];
  assert.ok(transferStudentId);
  await database.groupMembership.create({
    data: { groupId: sourceGroup.id, studentId: transferStudentId },
  });
  const transferResult = await executeGraphql(
    teacherToken,
    `mutation Request($input: RequestStudentTransferInput!) {
      requestStudentTransfer(input: $input) { transferRequest { id } }
    }`,
    {
      input: {
        reason: 'Reserved capacity check',
        studentId: transferStudentId,
        toGroupId: group.id,
      },
    },
  );
  const transferRequest = requireRecordField(
    requireRecordField(transferResult, 'requestStudentTransfer'),
    'transferRequest',
  );
  const rejectedTransfer = await executeGraphqlExpectingErrors(
    adminToken,
    `mutation Review($input: ReviewStudentTransferInput!) {
      reviewStudentTransfer(input: $input) { transferRequest { id } }
    }`,
    {
      input: {
        decision: 'APPROVED',
        reviewNote: 'Reserved capacity check',
        transferRequestId: transferRequest.id,
      },
    },
  );
  assert.equal(
    requireRecordField(
      requireRecord(
        requireArrayField(rejectedTransfer, 'errors')[0],
        'transfer capacity error',
      ),
      'extensions',
    ).code,
    'CONFLICT',
  );
  assert.equal(
    await database.groupMembership.count({
      where: {
        endedAt: null,
        groupId: sourceGroup.id,
        studentId: transferStudentId,
      },
    }),
    1,
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

void test('Teacher group roster exposes persisted status summary, overview, pause, and transfer departure', async () => {
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
  const destinationGroup = await database.group.create({
    data: {
      category: 'CEFR',
      name: `Reserved roster destination ${suffix}`,
      slug: `reserved-roster-destination-${suffix}`,
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
  const billingMonth = new Date(Date.UTC(2026, 8, 1));
  const dueDate = new Date(Date.now() - 86_400_000);
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
          membershipId studentId displayName rosterStatus outstandingBalanceUzs endedAt
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

  const transferResult = await executeGraphql(
    teacherToken,
    `mutation RequestRosterTransfer($input: RequestStudentTransferInput!) {
      requestStudentTransfer(input: $input) { transferRequest { id } }
    }`,
    {
      input: {
        reason: 'Reserved roster departure transfer',
        studentId: pausedStudentId,
        toGroupId: destinationGroup.id,
      },
    },
  );
  const transferRequestId = requireStringField(
    requireRecordField(
      requireRecordField(transferResult, 'requestStudentTransfer'),
      'transferRequest',
    ),
    'id',
  );
  await executeGraphql(
    adminToken,
    `mutation ApproveRosterTransfer($input: ReviewStudentTransferInput!) {
      reviewStudentTransfer(input: $input) { transferRequest { id status } }
    }`,
    {
      input: {
        decision: 'APPROVED',
        reviewNote: 'Reserved roster transfer approved',
        transferRequestId,
      },
    },
  );
  assert.equal(
    await database.groupMembership.count({
      where: { endedAt: null, groupId: rosterGroup.id },
    }),
    10,
  );
  assert.equal(
    await database.groupMembership.count({
      where: {
        endedAt: null,
        groupId: destinationGroup.id,
        studentId: pausedStudentId,
      },
    }),
    1,
  );
  const transferAudit = await database.auditLog.findFirst({
    where: { action: 'GROUP_TRANSFER_REVIEWED', targetId: transferRequestId },
  });
  assert.ok(transferAudit);
  const transferAuditValues = requireRecord(
    transferAudit.newValues,
    'transfer audit values',
  );
  assert.equal(typeof transferAuditValues.fromMembershipId, 'string');
  assert.equal(typeof transferAuditValues.toMembershipId, 'string');
});

void test('Admin provisions a credential user who completes email-code login', async () => {
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
      input: { displayName, email, password, role: 'STUDENT' },
    },
  );
  const user = requireRecordField(
    requireRecordField(provisioned, 'adminProvisionUser'),
    'user',
  );
  const userId = requireStringField(user, 'id');
  assert.equal(user.role, 'STUDENT');

  const storedUser = await requireApp()
    .get(DatabaseService)
    .user.findUnique({
      where: { id: userId },
      select: { credentialPasswordHash: true },
    });
  assert.match(storedUser?.credentialPasswordHash ?? '', /^\$argon2id\$/);
  assert.notEqual(storedUser?.credentialPasswordHash, password);

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
    'requestStudentTransfer',
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
    'adminLibraryItems',
    'adminMediaObjects',
    'adminAuditLogs',
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
