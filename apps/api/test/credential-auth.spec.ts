import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { parseAuthEnvironment } from '@best/config';
import { UserRole, UserStatus } from '@best/database';
import { Test } from '@nestjs/testing';

import { AUTH_ENVIRONMENT } from '../src/components/auth/auth.constants';
import { CredentialLoginService } from '../src/components/auth/credentials/credential-login.service';
import { CredentialPasswordService } from '../src/components/auth/credentials/credential-password.service';
import { CredentialSessionService } from '../src/components/auth/credentials/credential-session.service';
import { AuthService } from '../src/components/auth/tokens/auth.service';
import { DatabaseService } from '../src/database/database.service';
import { ErrorCode } from '../src/libs/enums/error-code.enum';
import { ApplicationError } from '../src/libs/errors/application.error';

interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  idleExpiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
}
interface RefreshToken {
  id: string;
  sessionId: string;
  tokenHash: string;
  consumedAt: Date | null;
}

async function fixture(context: TestContext) {
  const passwords = new CredentialPasswordService();
  const password = 'fictional-password-2026';
  const user: {
    id: string;
    email: string;
    displayName: string;
    credentialPasswordHash: string;
    role: UserRole;
    status: UserStatus;
  } = {
    id: randomUUID(),
    email: 'fictional@example.test',
    displayName: 'Fictional Student',
    credentialPasswordHash: await passwords.hashPassword(password),
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  };
  let sessionAvailable = true;
  const sessions = new Map<string, Session>();
  const tokens = new Map<string, RefreshToken>();
  const throttles = new Map<
    string,
    { failures: number; lockedUntil: Date | null }
  >();
  const actions: string[] = [];
  let issuedTokens = 0;
  const transaction = {
    user: {
      findFirst: ({
        where,
      }: {
        where: {
          id: string;
          credentialPasswordHash: string;
          role: UserRole;
          status: UserStatus;
        };
      }) =>
        Promise.resolve(
          sessionAvailable &&
            where.id === user.id &&
            where.credentialPasswordHash === user.credentialPasswordHash &&
            where.role === user.role &&
            where.status === user.status
            ? user
            : null,
        ),
    },
    credentialLoginThrottle: {
      findUnique: ({ where }: { where: { keyHash: string } }) =>
        Promise.resolve(throttles.get(where.keyHash) ?? null),
      upsert: ({
        where,
        create,
      }: {
        where: { keyHash: string };
        create: { failures: number; lockedUntil: Date | null };
      }) => {
        throttles.set(where.keyHash, create);
        return Promise.resolve(create);
      },
    },
    credentialSession: {
      create: ({
        data,
      }: {
        data: Omit<Session, 'id' | 'revokedAt' | 'revokeReason'>;
      }) => {
        const session = {
          ...data,
          id: randomUUID(),
          revokedAt: null,
          revokeReason: null,
        };
        sessions.set(session.id, session);
        return Promise.resolve(session);
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Session>;
      }) => {
        const session = sessions.get(where.id);
        assert.ok(session);
        Object.assign(session, data);
        return Promise.resolve(session);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Session>;
      }) => {
        const session = sessions.get(where.id);
        if (session?.revokedAt !== null) return Promise.resolve({ count: 0 });
        Object.assign(session, data);
        return Promise.resolve({ count: 1 });
      },
    },
    credentialRefreshToken: {
      create: ({ data }: { data: Omit<RefreshToken, 'consumedAt'> }) => {
        const token = { ...data, consumedAt: null };
        tokens.set(token.id, token);
        return Promise.resolve(token);
      },
      findUnique: ({ where }: { where: { id: string } }) => {
        const token = tokens.get(where.id);
        const session = token ? sessions.get(token.sessionId) : undefined;
        return Promise.resolve(
          token && session ? { ...token, session: { ...session, user } } : null,
        );
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { consumedAt: Date };
      }) => {
        const token = tokens.get(where.id);
        if (token?.consumedAt !== null) return Promise.resolve({ count: 0 });
        token.consumedAt = data.consumedAt;
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
  const module = await Test.createTestingModule({
    providers: [
      CredentialLoginService,
      CredentialSessionService,
      { provide: CredentialPasswordService, useValue: passwords },
      {
        provide: AuthService,
        useValue: {
          issueAccessToken: () => {
            issuedTokens++;
            return Promise.resolve('fictional-access-token');
          },
        },
      },
      {
        provide: AUTH_ENVIRONMENT,
        useValue: parseAuthEnvironment({
          AUTH_LOGIN_HASH_SECRET:
            'fictional-login-hmac-secret-with-32-characters',
          JWT_ACCESS_SECRET: 'fictional-jwt-signing-secret-with-32-characters',
          JWT_ACCESS_AUDIENCE: 'fictional',
          JWT_ACCESS_ISSUER: 'fictional',
          NODE_ENV: 'test',
        }),
      },
      {
        provide: DatabaseService,
        useValue: {
          ...transaction,
          user: {
            findUnique: ({ where }: { where: { email: string } }) =>
              Promise.resolve(where.email === user.email ? user : null),
          },
          credentialLoginThrottle: {
            ...transaction.credentialLoginThrottle,
            deleteMany: ({ where }: { where: { keyHash: string } }) => {
              throttles.delete(where.keyHash);
              return Promise.resolve({ count: 1 });
            },
          },
          $transaction: (work: (tx: typeof transaction) => Promise<unknown>) =>
            work(transaction),
        },
      },
    ],
  }).compile();
  context.after(() => module.close());
  const login = module.get(CredentialLoginService);
  return {
    login,
    sessionService: module.get(CredentialSessionService),
    sessions,
    tokens,
    throttles,
    actions,
    user,
    input: {
      email: user.email.toUpperCase(),
      name: user.displayName,
      password,
      expectedRole: UserRole.STUDENT,
    },
    issuedTokens: () => issuedTokens,
    disableSessionCreation: () => {
      sessionAvailable = false;
    },
  };
}

const hasCode = (code: ErrorCode) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;

void test('password login creates an audited session with only hashed refresh material', async (context) => {
  const f = await fixture(context);
  const result = await f.login.login(f.input, 'fictional-request');
  assert.equal(result.session.user.id, f.user.id);
  assert.equal(f.sessions.size, 1);
  assert.equal(f.tokens.size, 1);
  const stored = [...f.tokens.values()][0];
  assert.ok(stored);
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(stored.tokenHash, result.session.refreshToken);
  assert.equal(f.issuedTokens(), 1);
  assert.deepEqual(f.actions, ['AUTH_CREDENTIAL_LOGIN_SUCCEEDED']);
});

void test('bad credentials remain throttled and cannot create sessions', async (context) => {
  const f = await fixture(context);
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(
      f.login.login({ ...f.input, password: 'wrong-fictional-password' }),
      hasCode(ErrorCode.LOGIN_PASSWORD_INVALID),
    );
  }
  await assert.rejects(
    f.login.login(f.input),
    hasCode(ErrorCode.UNAUTHENTICATED),
  );
  assert.equal(f.sessions.size, 0);
  assert.equal(f.issuedTokens(), 0);
  const key = [...f.throttles.keys()][0];
  assert.ok(key);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key.includes(f.user.email), false);
});

void test('role/profile mismatches and a changed account cannot issue sessions', async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    f.login.login({ ...f.input, expectedRole: UserRole.ADMIN }),
    hasCode(ErrorCode.UNAUTHENTICATED),
  );
  await assert.rejects(
    f.login.login({
      ...f.input,
      firstName: 'Wrong',
      lastName: 'Student',
      name: 'Wrong Student',
    }),
    hasCode(ErrorCode.LOGIN_FIRST_NAME_INVALID),
  );
  f.disableSessionCreation();
  await assert.rejects(
    f.login.login(f.input),
    hasCode(ErrorCode.UNAUTHENTICATED),
  );
  assert.equal(f.issuedTokens(), 0);
  assert.equal(f.sessions.size, 0);
});

void test('refresh rotation rejects reuse and revokes the session family', async (context) => {
  const f = await fixture(context);
  const { session } = await f.login.login(f.input);
  const replacement = await f.sessionService.refreshSession({
    refreshToken: session.refreshToken,
  });
  assert.notEqual(replacement.refreshToken, session.refreshToken);
  await assert.rejects(
    f.sessionService.refreshSession({ refreshToken: session.refreshToken }),
    hasCode(ErrorCode.UNAUTHENTICATED),
  );
  await assert.rejects(
    f.sessionService.refreshSession({ refreshToken: replacement.refreshToken }),
    hasCode(ErrorCode.UNAUTHENTICATED),
  );
  assert.equal([...f.sessions.values()][0]?.revokeReason, 'TOKEN_REUSE');
  assert.equal(
    f.actions.filter((action) => action === 'AUTH_REFRESH_TOKEN_REUSED').length,
    1,
  );
});

void test('logout is idempotent and forged tokens cannot revoke a session', async (context) => {
  const f = await fixture(context);
  const { session } = await f.login.login(f.input);
  const tokenId = session.refreshToken.split('.')[0];
  assert.ok(tokenId);
  await f.sessionService.revokeSession({
    refreshToken: `${tokenId}.${'A'.repeat(43)}`,
  });
  assert.equal([...f.sessions.values()][0]?.revokedAt, null);
  assert.equal(
    await f.sessionService.revokeSession({
      refreshToken: session.refreshToken,
    }),
    true,
  );
  assert.equal(
    await f.sessionService.revokeSession({
      refreshToken: session.refreshToken,
    }),
    true,
  );
  await assert.rejects(
    f.sessionService.refreshSession({ refreshToken: session.refreshToken }),
    hasCode(ErrorCode.UNAUTHENTICATED),
  );
  assert.equal(
    f.actions.filter((action) => action === 'AUTH_CREDENTIAL_SESSION_REVOKED')
      .length,
    1,
  );
});

void test('idle expiry and disabled accounts reject refresh before issuing an access token', async (context) => {
  for (const expired of [true, false]) {
    const f = await fixture(context);
    const { session } = await f.login.login(f.input);
    const stored = [...f.sessions.values()][0];
    assert.ok(stored);
    if (expired) stored.idleExpiresAt = new Date(0);
    else f.user.status = UserStatus.INACTIVE;
    await assert.rejects(
      f.sessionService.refreshSession({ refreshToken: session.refreshToken }),
      hasCode(ErrorCode.UNAUTHENTICATED),
    );
    assert.equal(f.issuedTokens(), 1);
    assert.equal(
      stored.revokeReason,
      expired ? 'IDLE_EXPIRED' : 'ACCOUNT_UNAVAILABLE',
    );
  }
});
