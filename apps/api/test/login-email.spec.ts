import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidLoginEmail } from '../src/components/auth/login-email';

void test('login validates structure, normalizes whitespace and rejects reserved domains', () => {
  for (const email of [
    'student+class@gmail.com',
    '  FIRST.LAST@GMAIL.COM  ',
    'a@school.co.uz',
  ]) {
    assert.equal(isValidLoginEmail(email), true, email);
  }
  for (const email of [
    '',
    'name@host',
    'a@@gmail.com',
    'a b@gmail.com',
    '.a@gmail.com',
    'a..b@gmail.com',
    'a.@gmail.com',
    'a@-mail.com',
    'a@mail-.com',
    'a@mail..com',
    'a@mail.c',
    `${'a'.repeat(65)}@gmail.com`,
  ]) {
    assert.equal(isValidLoginEmail(email, true), false, email);
  }
  for (const email of [
    'best@example.com',
    'a@sub.example.org',
    'a@school.test',
    'a@host.invalid',
    'a@host.localhost',
  ]) {
    assert.equal(isValidLoginEmail(email), false, email);
    assert.equal(isValidLoginEmail(email, true), true, email);
  }
});
