import { Language, UserRole, UserStatus } from '@best/database';
import assert from 'node:assert/strict';
import test from 'node:test';

import { CredentialPasswordService } from '../src/components/auth/credential-password.service';
import { AuthIdentityService } from '../src/components/auth/auth-identity.service';
import { UsersService } from '../src/components/users/users.service';
import type { DatabaseService } from '../src/database/database.service';

void test('Teacher account deletion disables credentials and sessions with an audit entry', async () => {
  const passwordService = new CredentialPasswordService();
  let status: UserStatus = UserStatus.ACTIVE;
  let passwordHash: string | null = await passwordService.hashPassword(
    'old-reserved-password',
  );
  let revokedSessions = 0;
  let deletedChallenges = 0;
  const auditActions: string[] = [];
  const transaction = {
    user: {
      updateMany: ({
        where,
        data,
      }: {
        where: { status: UserStatus };
        data: { credentialPasswordHash: null; status: UserStatus };
      }) => {
        if (where.status !== status) return Promise.resolve({ count: 0 });
        status = data.status;
        passwordHash = data.credentialPasswordHash;
        return Promise.resolve({ count: 1 });
      },
    },
    credentialSession: {
      updateMany: () => {
        revokedSessions += 1;
        return Promise.resolve({ count: 1 });
      },
    },
    credentialLoginChallenge: {
      deleteMany: () => {
        deletedChallenges += 1;
        return Promise.resolve({ count: 1 });
      },
    },
    auditLog: {
      create: ({ data }: { data: { action: string } }) => {
        auditActions.push(data.action);
        return Promise.resolve();
      },
    },
  };
  const database = {
    user: {
      findUnique: () =>
        Promise.resolve({
          id: 'reserved-teacher-id',
          role: UserRole.TEACHER,
          status,
        }),
    },
    $transaction: (run: (client: typeof transaction) => Promise<void>) =>
      run(transaction),
  } as unknown as DatabaseService;
  const service = new UsersService(database, passwordService);

  await service.deleteMyTeacherAccount('reserved-teacher-id');
  assert.equal(status, UserStatus.DELETED);
  assert.equal(passwordHash, null);
  assert.equal(
    await passwordService.verifyPassword('old-reserved-password', passwordHash),
    false,
  );
  assert.equal(
    await new AuthIdentityService(database).findActiveMember(
      'reserved-teacher-id',
    ),
    undefined,
  );
  assert.equal(revokedSessions, 1);
  assert.equal(deletedChallenges, 1);
  assert.deepEqual(auditActions, ['TEACHER_ACCOUNT_DELETED']);

  await assert.rejects(service.deleteMyTeacherAccount('reserved-teacher-id'));
  assert.equal(revokedSessions, 1);
  assert.equal(deletedChallenges, 1);
});

void test('Admin user directory projects the active group and teacher for student filters', async () => {
  const startedAt = new Date('2026-09-01T09:00:00.000Z');
  const createdAt = new Date('2026-08-20T09:00:00.000Z');
  const database = {
    user: {
      findMany: () =>
        Promise.resolve([
          {
            avatarMediaObjectId: null,
            branchName: null,
            createdAt,
            displayName: 'Reserved Student',
            email: 'student@example.com',
            groupMemberships: [
              {
                group: {
                  id: '00000000-0000-4000-8000-000000000011',
                  name: 'Reserved CEFR Group',
                  teacher: {
                    displayName: 'Reserved Teacher',
                    id: '00000000-0000-4000-8000-000000000012',
                  },
                },
                startedAt,
              },
            ],
            id: '00000000-0000-4000-8000-000000000010',
            phone: null,
            preferredLanguage: Language.EN,
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
            teacherSubject: null,
            updatedAt: createdAt,
          },
        ]),
    },
  } as unknown as DatabaseService;
  const service = new UsersService(database, new CredentialPasswordService());

  const result = await service.getAdminUsers(
    10,
    undefined,
    UserRole.STUDENT,
    undefined,
    undefined,
  );
  const student = result.edges[0]?.node;

  assert.ok(student);
  assert.equal(student.activeGroupName, 'Reserved CEFR Group');
  assert.equal(student.activeTeacherName, 'Reserved Teacher');
  assert.equal(student.activeMembershipStartedAt, startedAt);
});
