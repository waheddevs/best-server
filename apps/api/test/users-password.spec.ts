import assert from 'node:assert/strict';
import test from 'node:test';

import { CredentialPasswordService } from '../src/components/auth/credential-password.service';
import { UsersService } from '../src/components/users/users.service';
import type { DatabaseService } from '../src/database/database.service';

void test('Teacher password change verifies the old password, saves a new hash, and audits it', async () => {
  const passwordService = new CredentialPasswordService();
  const oldHash = await passwordService.hashPassword('old-reserved-password');
  let savedHash = oldHash;
  const actions: string[] = [];
  const transaction = {
    user: {
      updateMany: ({
        where,
        data,
      }: {
        where: { credentialPasswordHash: string | null };
        data: { credentialPasswordHash: string };
      }) => {
        if (where.credentialPasswordHash !== savedHash)
          return Promise.resolve({ count: 0 });
        savedHash = data.credentialPasswordHash;
        return Promise.resolve({ count: 1 });
      },
    },
    auditLog: {
      create: ({ data }: { data: { action: string } }) => {
        actions.push(data.action);
        return Promise.resolve();
      },
    },
  };
  const database = {
    user: {
      findFirst: () => Promise.resolve({ credentialPasswordHash: savedHash }),
    },
    $transaction: (run: (client: typeof transaction) => Promise<void>) =>
      run(transaction),
  } as unknown as DatabaseService;
  const service = new UsersService(database, passwordService);

  await assert.rejects(
    service.changeMyPassword('reserved-user-id', {
      currentPassword: 'wrong-reserved-password',
      newPassword: 'new-reserved-password',
      confirmPassword: 'new-reserved-password',
    }),
    /Current password is incorrect/,
  );
  assert.equal(savedHash, oldHash);
  assert.deepEqual(actions, []);

  await assert.rejects(
    service.changeMyPassword('reserved-user-id', {
      currentPassword: 'old-reserved-password',
      newPassword: 'new-reserved-password',
      confirmPassword: 'different-reserved-password',
    }),
    /New passwords do not match/,
  );
  assert.equal(savedHash, oldHash);

  await service.changeMyPassword('reserved-user-id', {
    currentPassword: 'old-reserved-password',
    newPassword: 'new-reserved-password',
    confirmPassword: 'new-reserved-password',
  });
  assert.notEqual(savedHash, oldHash);
  assert.equal(
    await passwordService.verifyPassword('new-reserved-password', savedHash),
    true,
  );
  assert.equal(
    await passwordService.verifyPassword('old-reserved-password', savedHash),
    false,
  );
  assert.deepEqual(actions, ['USER_PASSWORD_CHANGED']);
});
