import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuthEnvironment } from '@best/config';
import { AuthProvider, UserRole } from '@best/database';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuthExchangeController } from '../src/components/auth/auth-exchange.controller';
import { AuthExchangeService } from '../src/components/auth/auth-exchange.service';
import type {
  AuthIdentityProvisioner,
  SocialIdentity,
} from '../src/components/auth/auth-identity.type';
import { AuthService } from '../src/components/auth/auth.service';
import type { AuthIdentityReader } from '../src/libs/types/auth-identity-reader.type';
import type { AuthenticatedMember } from '../src/libs/types/authenticated-member.type';

const environment: AuthEnvironment = {
  accessTokenAudience: 'best-clients',
  accessTokenIssuer: 'best-api',
  accessTokenSecret: 'an-access-token-secret-longer-than-32-characters',
  accessTokenTtlSeconds: 900,
  identityExchangeAudience: 'best-api',
  identityExchangeIssuer: 'best-web',
  identityExchangeSecret:
    'an-identity-exchange-secret-longer-than-32-characters',
};
const member: AuthenticatedMember = {
  id: '10000000-0000-4000-8000-000000000001',
  role: UserRole.STUDENT,
};

class TestIdentityProvisioner implements AuthIdentityProvisioner {
  resolvedIdentity: SocialIdentity | undefined;

  resolveOrProvisionSocialIdentity(
    identity: SocialIdentity,
  ): Promise<AuthenticatedMember> {
    this.resolvedIdentity = identity;
    return Promise.resolve(member);
  }
}

function createFixture(): {
  authExchangeService: AuthExchangeService;
  authService: AuthService;
  identityProvisioner: TestIdentityProvisioner;
  jwtService: JwtService;
} {
  const jwtService = new JwtService({
    secret: environment.accessTokenSecret,
    signOptions: {
      algorithm: 'HS256',
      audience: environment.accessTokenAudience,
      expiresIn: environment.accessTokenTtlSeconds,
      issuer: environment.accessTokenIssuer,
    },
    verifyOptions: {
      algorithms: ['HS256'],
      audience: environment.accessTokenAudience,
      issuer: environment.accessTokenIssuer,
    },
  });
  const identityReader: AuthIdentityReader = {
    findActiveMember: () => Promise.resolve(member),
  };
  const authService = new AuthService(jwtService, identityReader);
  const identityProvisioner = new TestIdentityProvisioner();

  return {
    authExchangeService: new AuthExchangeService(
      jwtService,
      authService,
      identityProvisioner,
      environment,
    ),
    authService,
    identityProvisioner,
    jwtService,
  };
}

void test('exchanges a signed social identity without trusting role claims', async () => {
  const fixture = createFixture();
  const assertion = await signIdentityAssertion(fixture.jwtService, {
    email: ' Student@Example.COM ',
    emailVerified: true,
    name: ' Integration Student ',
    provider: 'google',
    role: 'ADMIN',
    sub: 'google-account-1',
  });

  const result =
    await fixture.authExchangeService.exchangeIdentityAssertion(assertion);
  const resolvedIdentity = fixture.identityProvisioner.resolvedIdentity;

  assert.notEqual(resolvedIdentity, undefined);
  assert.deepEqual(resolvedIdentity, {
    assertionId: 'assertion-1',
    displayName: 'Integration Student',
    email: 'student@example.com',
    emailVerified: true,
    provider: AuthProvider.GOOGLE,
    providerAccountId: 'google-account-1',
  });
  assert.equal(result.expiresInSeconds, 900);
  assert.deepEqual(
    await fixture.authService.verifyAccessToken(result.accessToken),
    member,
  );
});

void test('accepts a Facebook identity when the provider omits email', async () => {
  const fixture = createFixture();
  const assertion = await signIdentityAssertion(fixture.jwtService, {
    emailVerified: false,
    name: 'Facebook Student',
    provider: 'facebook',
    sub: 'facebook-account-1',
  });

  await fixture.authExchangeService.exchangeIdentityAssertion(assertion);

  assert.deepEqual(fixture.identityProvisioner.resolvedIdentity, {
    assertionId: 'assertion-1',
    displayName: 'Facebook Student',
    emailVerified: false,
    provider: AuthProvider.FACEBOOK,
    providerAccountId: 'facebook-account-1',
  });
});

void test('rejects forged, overlong, and incomplete identity assertions', async () => {
  const fixture = createFixture();
  const forgedAssertion = await fixture.jwtService.signAsync(
    createIdentityPayload({
      emailVerified: false,
      name: 'Forged Student',
      provider: 'google',
      sub: 'google-account-2',
    }),
    {
      algorithm: 'HS256',
      audience: environment.identityExchangeAudience,
      expiresIn: 60,
      issuer: environment.identityExchangeIssuer,
      jwtid: 'assertion-1',
      secret: 'a-forged-secret-that-is-longer-than-32-characters',
    },
  );
  const overlongAssertion = await signIdentityAssertion(
    fixture.jwtService,
    {
      emailVerified: false,
      name: 'Long Session',
      provider: 'google',
      sub: 'google-account-3',
    },
    120,
  );
  const incompleteAssertion = await signIdentityAssertion(fixture.jwtService, {
    emailVerified: true,
    name: 'Missing Email',
    provider: 'google',
    sub: 'google-account-4',
  });

  for (const assertion of [
    forgedAssertion,
    overlongAssertion,
    incompleteAssertion,
  ]) {
    await assert.rejects(
      fixture.authExchangeService.exchangeIdentityAssertion(assertion),
      UnauthorizedException,
    );
  }
});

void test('controller accepts only a single assertion field', async () => {
  const fixture = createFixture();
  const controller = new AuthExchangeController(fixture.authExchangeService);
  const assertion = await signIdentityAssertion(fixture.jwtService, {
    emailVerified: false,
    name: 'Controller Student',
    provider: 'apple',
    sub: 'apple-account-1',
  });

  assert.equal(
    (await controller.exchange({ assertion })).expiresInSeconds,
    environment.accessTokenTtlSeconds,
  );
  await assert.rejects(
    controller.exchange({ assertion, role: 'ADMIN' }),
    BadRequestException,
  );
});

function signIdentityAssertion(
  jwtService: JwtService,
  payload: Record<string, unknown>,
  expiresIn = 60,
): Promise<string> {
  return jwtService.signAsync(createIdentityPayload(payload), {
    algorithm: 'HS256',
    audience: environment.identityExchangeAudience,
    expiresIn,
    issuer: environment.identityExchangeIssuer,
    jwtid: 'assertion-1',
    secret: environment.identityExchangeSecret,
  });
}

function createIdentityPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    tokenType: 'identity_exchange',
    ...payload,
  };
}
