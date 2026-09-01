import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EnvironmentValidationError,
  parseApiEnvironment,
  parseAuthEnvironment,
  parseInfrastructureEnvironment,
  parseWorkerEnvironment,
} from '../src/environment';

void test('API environment uses safe development defaults', () => {
  assert.deepEqual(parseApiEnvironment({}), {
    apiPort: 4000,
    nodeEnvironment: 'development',
  });
});

void test('auth environment parses the bearer access-token contract', () => {
  assert.deepEqual(
    parseAuthEnvironment({
      JWT_ACCESS_AUDIENCE: 'best-clients',
      JWT_ACCESS_ISSUER: 'best-api',
      JWT_ACCESS_SECRET: 'a-development-secret-with-32-characters',
    }),
    {
      accessTokenAudience: 'best-clients',
      accessTokenIssuer: 'best-api',
      accessTokenSecret: 'a-development-secret-with-32-characters',
      accessTokenTtlSeconds: 900,
    },
  );
});

void test('auth environment rejects weak secrets and invalid token TTLs', () => {
  const validSource = {
    JWT_ACCESS_AUDIENCE: 'best-clients',
    JWT_ACCESS_ISSUER: 'best-api',
    JWT_ACCESS_SECRET: 'a-development-secret-with-32-characters',
  };

  assert.throws(
    () =>
      parseAuthEnvironment({
        ...validSource,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    EnvironmentValidationError,
  );

  for (const tokenTtl of ['59', '3601', 'not-a-number']) {
    assert.throws(
      () =>
        parseAuthEnvironment({
          ...validSource,
          JWT_ACCESS_TTL_SECONDS: tokenTtl,
        }),
      EnvironmentValidationError,
    );
  }
});

void test('API environment parses supported explicit values', () => {
  assert.deepEqual(
    parseApiEnvironment({ API_PORT: ' 4100 ', NODE_ENV: 'production' }),
    {
      apiPort: 4100,
      nodeEnvironment: 'production',
    },
  );
});

void test('worker environment validates NODE_ENV', () => {
  assert.deepEqual(parseWorkerEnvironment({ NODE_ENV: 'test' }), {
    nodeEnvironment: 'test',
  });

  assert.throws(
    () => parseWorkerEnvironment({ NODE_ENV: 'staging' }),
    EnvironmentValidationError,
  );
});

void test('API environment rejects malformed or out-of-range ports', () => {
  for (const apiPort of ['0', '65536', '40.5', 'not-a-port']) {
    assert.throws(
      () => parseApiEnvironment({ API_PORT: apiPort }),
      EnvironmentValidationError,
    );
  }
});

void test('infrastructure environment returns typed connection settings', () => {
  assert.deepEqual(
    parseInfrastructureEnvironment({
      POSTGRES_DB: 'best',
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PASSWORD: 'local-password',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'best',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
    }),
    {
      postgres: {
        database: 'best',
        host: '127.0.0.1',
        password: 'local-password',
        port: 5432,
        url: 'postgresql://best:local-password@127.0.0.1:5432/best?schema=public',
        user: 'best',
      },
      redis: {
        host: '127.0.0.1',
        port: 6379,
      },
    },
  );
});

void test('infrastructure environment preserves an explicit database URL', () => {
  const environment = parseInfrastructureEnvironment({
    DATABASE_URL: 'postgresql://pooled.example/best',
    POSTGRES_DB: 'best',
    POSTGRES_HOST: '127.0.0.1',
    POSTGRES_PASSWORD: 'local-password',
    POSTGRES_PORT: '5432',
    POSTGRES_USER: 'best',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: '6379',
  });

  assert.equal(environment.postgres.url, 'postgresql://pooled.example/best');
});

void test('infrastructure environment requires every connection value', () => {
  assert.throws(
    () =>
      parseInfrastructureEnvironment({
        POSTGRES_DB: 'best',
        POSTGRES_HOST: '127.0.0.1',
        POSTGRES_PORT: '5432',
        POSTGRES_USER: 'best',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
      }),
    new EnvironmentValidationError(
      'POSTGRES_PASSWORD',
      'expected a non-empty value',
    ),
  );
});
