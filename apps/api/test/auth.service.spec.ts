import assert from 'node:assert/strict';
import test from 'node:test';

import { UserRole } from '@best/database';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from '../src/components/auth/auth.service';
import type { AuthIdentityReader } from '../src/libs/types/auth-identity-reader.type';
import type { AuthenticatedMember } from '../src/libs/types/authenticated-member.type';

const JWT_SECRET = 'a-test-secret-that-is-longer-than-32-characters';

function createAuthService(
  member: AuthenticatedMember | undefined,
): AuthService {
  const jwtService = new JwtService({
    secret: JWT_SECRET,
    signOptions: {
      algorithm: 'HS256',
      audience: 'best-clients',
      expiresIn: 900,
      issuer: 'best-api',
    },
    verifyOptions: {
      algorithms: ['HS256'],
      audience: 'best-clients',
      issuer: 'best-api',
    },
  });
  const identityReader: AuthIdentityReader = {
    findActiveMember: () => Promise.resolve(member),
  };

  return new AuthService(jwtService, identityReader);
}

void test('AuthService issues and verifies an access token', async () => {
  const member = { id: 'user-1', role: UserRole.STUDENT };
  const service = createAuthService(member);

  const token = await service.issueAccessToken(member);

  assert.deepEqual(await service.verifyAccessToken(token), member);
});

void test('AuthService rejects a token signed by another key', async () => {
  const member = { id: 'user-1', role: UserRole.STUDENT };
  const service = createAuthService(member);
  const foreignJwtService = new JwtService({
    secret: 'another-test-secret-that-is-longer-than-32-characters',
    signOptions: {
      algorithm: 'HS256',
      audience: 'best-clients',
      issuer: 'best-api',
    },
  });
  const token = await foreignJwtService.signAsync({
    sub: member.id,
    tokenType: 'access',
  });

  await assert.rejects(service.verifyAccessToken(token), UnauthorizedException);
});

void test('AuthService rejects a token after its User becomes inactive', async () => {
  const activeMember = { id: 'user-1', role: UserRole.STUDENT };
  const issuingService = createAuthService(activeMember);
  const verifyingService = createAuthService(undefined);
  const token = await issuingService.issueAccessToken(activeMember);

  await assert.rejects(
    verifyingService.verifyAccessToken(token),
    UnauthorizedException,
  );
});
