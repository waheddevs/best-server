import { UserRole, UserStatus } from '@best/database';
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
