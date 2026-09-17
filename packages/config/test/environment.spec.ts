import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EnvironmentValidationError,
  parseApiEnvironment,
  parseAuthEnvironment,
  parseInfrastructureEnvironment,
  parseMalwareScannerEnvironment,
  parseObjectStorageEnvironment,
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
      AUTH_OTP_HASH_SECRET: 'a-different-otp-secret-with-32-characters',
      JWT_ACCESS_AUDIENCE: 'best-clients',
      JWT_ACCESS_ISSUER: 'best-api',
      JWT_ACCESS_SECRET: 'a-development-secret-with-32-characters',
    }),
    {
      accessTokenAudience: 'best-clients',
      accessTokenIssuer: 'best-api',
      accessTokenSecret: 'a-development-secret-with-32-characters',
      accessTokenTtlSeconds: 3600,
      credentialEmail: undefined,
      otpHashSecret: 'a-different-otp-secret-with-32-characters',
    },
  );
});

void test('auth environment rejects weak secrets and invalid token TTLs', () => {
  const validSource = {
    AUTH_OTP_HASH_SECRET: 'a-different-otp-secret-with-32-characters',
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

  assert.throws(
    () =>
      parseAuthEnvironment({
        ...validSource,
        AUTH_OTP_HASH_SECRET: validSource.JWT_ACCESS_SECRET,
      }),
    EnvironmentValidationError,
  );
});

void test('auth environment parses SMTP delivery and requires it in production', () => {
  const shared = {
    AUTH_OTP_HASH_SECRET: 'a-different-otp-secret-with-32-characters',
    JWT_ACCESS_AUDIENCE: 'best-clients',
    JWT_ACCESS_ISSUER: 'best-api',
    JWT_ACCESS_SECRET: 'a-development-secret-with-32-characters',
  };
  const environment = parseAuthEnvironment({
    ...shared,
    AUTH_EMAIL_DELIVERY_MODE: 'smtp',
    AUTH_EMAIL_FROM: 'BEST LC <no-reply@best-lc.example>',
    AUTH_SMTP_HOST: 'smtp.example.test',
    AUTH_SMTP_PASSWORD: 'secret',
    AUTH_SMTP_PORT: '587',
    AUTH_SMTP_SECURE: 'false',
    AUTH_SMTP_USER: 'mailer',
  });

  assert.deepEqual(environment.credentialEmail, {
    from: 'BEST LC <no-reply@best-lc.example>',
    host: 'smtp.example.test',
    password: 'secret',
    port: 587,
    secure: false,
    user: 'mailer',
  });
  assert.throws(
    () => parseAuthEnvironment({ ...shared, NODE_ENV: 'production' }),
    EnvironmentValidationError,
  );
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

void test('object storage environment parses a private S3 contract', () => {
  assert.deepEqual(
    parseObjectStorageEnvironment({
      S3_ACCESS_KEY_ID: 'best-local-storage',
      S3_BUCKET: 'best-private',
      S3_ENDPOINT: 'http://127.0.0.1:8333/',
      S3_FORCE_PATH_STYLE: 'true',
      S3_REGION: 'us-east-1',
      S3_SECRET_ACCESS_KEY: 'a-local-secret-with-enough-length',
    }),
    {
      accessKeyId: 'best-local-storage',
      bucket: 'best-private',
      downloadUrlTtlSeconds: 300,
      endpoint: 'http://127.0.0.1:8333',
      forcePathStyle: true,
      maxUploadBytes: 52_428_800,
      region: 'us-east-1',
      secretAccessKey: 'a-local-secret-with-enough-length',
      uploadUrlTtlSeconds: 300,
    },
  );
});

void test('object storage environment rejects unsafe settings', () => {
  const validSource = {
    S3_ACCESS_KEY_ID: 'best-local-storage',
    S3_BUCKET: 'best-private',
    S3_ENDPOINT: 'http://127.0.0.1:8333',
    S3_REGION: 'us-east-1',
    S3_SECRET_ACCESS_KEY: 'a-local-secret-with-enough-length',
  };

  for (const invalidSource of [
    { S3_BUCKET: 'UPPERCASE' },
    { S3_ENDPOINT: 'ftp://127.0.0.1:8333' },
    { S3_FORCE_PATH_STYLE: 'yes' },
    { S3_MAX_UPLOAD_BYTES: '0' },
    { S3_SECRET_ACCESS_KEY: 'too-short' },
    { S3_UPLOAD_URL_TTL_SECONDS: '3600' },
  ]) {
    assert.throws(
      () => parseObjectStorageEnvironment({ ...validSource, ...invalidSource }),
      EnvironmentValidationError,
    );
  }
});

void test('malware scanner environment parses bounded TCP settings', () => {
  assert.deepEqual(
    parseMalwareScannerEnvironment({
      CLAMAV_HOST: '127.0.0.1',
      CLAMAV_PORT: '3310',
    }),
    {
      connectTimeoutMilliseconds: 5_000,
      host: '127.0.0.1',
      port: 3_310,
      scanTimeoutMilliseconds: 60_000,
    },
  );
});

void test('malware scanner environment rejects unsafe endpoints and timeouts', () => {
  for (const invalidSource of [
    { CLAMAV_HOST: 'http://127.0.0.1' },
    { CLAMAV_PORT: '0' },
    { CLAMAV_SCAN_TIMEOUT_MS: '999' },
    { CLAMAV_CONNECT_TIMEOUT_MS: '30001' },
  ]) {
    assert.throws(
      () =>
        parseMalwareScannerEnvironment({
          CLAMAV_HOST: '127.0.0.1',
          CLAMAV_PORT: '3310',
          ...invalidSource,
        }),
      EnvironmentValidationError,
    );
  }
});
