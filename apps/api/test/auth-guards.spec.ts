import assert from 'node:assert/strict';
import test from 'node:test';

import { UserRole } from '@best/database';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

import { AUTH_ROLES_METADATA } from '../src/components/auth/decorators/roles.decorator';
import { AuthGuard } from '../src/components/auth/guards/auth.guard';
import { OptionalAuthGuard } from '../src/components/auth/guards/optional-auth.guard';
import { RolesGuard } from '../src/components/auth/guards/roles.guard';
import type { AccessTokenVerifier } from '../src/libs/types/access-token-verifier.type';
import type { AuthenticatedMember } from '../src/libs/types/authenticated-member.type';
import type { AuthenticatedRequest } from '../src/libs/types/authenticated-request.type';

class TestResolver {
  resolve(): void {
    return;
  }
}

function createHttpContext(
  request: AuthenticatedRequest,
  handler: () => void = () => undefined,
): ExecutionContextHost {
  const context = new ExecutionContextHost([request], TestResolver, handler);
  context.setType('http');

  return context;
}

function createTokenVerifier(member: AuthenticatedMember): AccessTokenVerifier {
  return {
    verifyAccessToken: () => Promise.resolve(member),
  };
}

void test('AuthGuard rejects an anonymous request', async () => {
  const guard = new AuthGuard(
    createTokenVerifier({ id: 'user-1', role: UserRole.STUDENT }),
  );

  await assert.rejects(
    guard.canActivate(createHttpContext({})),
    UnauthorizedException,
  );
});

void test('AuthGuard verifies a bearer token and attaches its member', async () => {
  const member = { id: 'user-1', role: UserRole.STUDENT };
  const request: AuthenticatedRequest = {
    headers: { authorization: 'Bearer access-token' },
  };
  const guard = new AuthGuard(createTokenVerifier(member));

  assert.equal(await guard.canActivate(createHttpContext(request)), true);
  assert.deepEqual(request.authMember, member);
});

void test('RolesGuard rejects a member without an allowed role', () => {
  const handler = (): void => undefined;
  Reflect.defineMetadata(AUTH_ROLES_METADATA, [UserRole.ADMIN], handler);

  const guard = new RolesGuard(new Reflector());
  const context = createHttpContext(
    { authMember: { id: 'user-1', role: UserRole.TEACHER } },
    handler,
  );

  assert.throws(() => guard.canActivate(context), ForbiddenException);
});

void test('RolesGuard accepts a member with an allowed role', () => {
  const handler = (): void => undefined;
  Reflect.defineMetadata(AUTH_ROLES_METADATA, [UserRole.ADMIN], handler);

  const guard = new RolesGuard(new Reflector());
  const context = createHttpContext(
    { authMember: { id: 'user-1', role: UserRole.ADMIN } },
    handler,
  );

  assert.equal(guard.canActivate(context), true);
});

void test('OptionalAuthGuard accepts an anonymous request', async () => {
  const guard = new OptionalAuthGuard(
    createTokenVerifier({ id: 'user-1', role: UserRole.STUDENT }),
  );

  assert.equal(await guard.canActivate(createHttpContext({})), true);
});

void test('OptionalAuthGuard rejects malformed credentials', async () => {
  const guard = new OptionalAuthGuard(
    createTokenVerifier({ id: 'user-1', role: UserRole.STUDENT }),
  );

  await assert.rejects(
    guard.canActivate(
      createHttpContext({ headers: { authorization: 'Basic token' } }),
    ),
    UnauthorizedException,
  );
});
