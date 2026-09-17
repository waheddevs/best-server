import assert from 'node:assert/strict';
import test from 'node:test';

import { CredentialPasswordService } from '../src/components/auth/credential-password.service';

void test('CredentialPasswordService stores Argon2id and verifies it', async () => {
  const service = new CredentialPasswordService();
  const digest = await service.hashPassword('reserved-test-password');

  assert.match(digest, /^\$argon2id\$/);
  assert.equal(
    await service.verifyPassword('reserved-test-password', digest),
    true,
  );
  assert.equal(await service.verifyPassword('wrong-password', digest), false);
});

void test('CredentialPasswordService performs a dummy check for missing accounts', async () => {
  const service = new CredentialPasswordService();

  assert.equal(
    await service.verifyPassword('reserved-test-password', undefined),
    false,
  );
});
