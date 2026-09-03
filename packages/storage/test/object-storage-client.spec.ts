import assert from 'node:assert/strict';
import test from 'node:test';

import type { ObjectStorageEnvironment } from '@best/config';

import { createPrivateObjectKey } from '../src/object-key';
import { ObjectStorageClient } from '../src/object-storage-client';
import { StorageInputError } from '../src/storage-input.error';

const environment: ObjectStorageEnvironment = {
  accessKeyId: 'fake-access-key',
  bucket: 'best-private',
  downloadUrlTtlSeconds: 300,
  endpoint: 'http://127.0.0.1:8333',
  forcePathStyle: true,
  maxUploadBytes: 10_000,
  region: 'us-east-1',
  secretAccessKey: 'fake-secret-key-with-enough-length',
  uploadUrlTtlSeconds: 300,
};

void test('creates opaque owner-scoped private object keys', () => {
  assert.equal(
    createPrivateObjectKey({
      mediaObjectId: '3c87cd98-2e93-4dd4-8975-8b6d575639fc',
      ownerId: '4ad22eac-a5f4-475c-b180-948f81d75a67',
    }),
    'private/4ad22eac-a5f4-475c-b180-948f81d75a67/3c87cd98-2e93-4dd4-8975-8b6d575639fc',
  );

  assert.throws(
    () =>
      createPrivateObjectKey({
        mediaObjectId: '../report.pdf',
        ownerId: '4ad22eac-a5f4-475c-b180-948f81d75a67',
      }),
    StorageInputError,
  );
});

void test('creates a single-write, exact-size signed upload URL', async () => {
  const storage = new ObjectStorageClient(environment);

  try {
    const intent = await storage.createUploadIntent({
      contentLength: 5_000,
      contentType: 'application/pdf',
      key: 'private/4ad22eac-a5f4-475c-b180-948f81d75a67/3c87cd98-2e93-4dd4-8975-8b6d575639fc',
    });

    assert.equal(intent.method, 'PUT');
    assert.equal(intent.contentLength, 5_000);
    assert.equal(intent.contentType, 'application/pdf');
    assert.equal(intent.requiredHeaders['If-None-Match'], '*');
    assert.match(intent.url, /^http:\/\/127\.0\.0\.1:8333\/best-private\//);
    assert.match(
      decodeURIComponent(intent.url),
      /X-Amz-SignedHeaders=content-length;host;if-none-match/,
    );
  } finally {
    storage.destroy();
  }
});

void test('creates a short-lived signed private download URL', async () => {
  const storage = new ObjectStorageClient(environment);

  try {
    const intent = await storage.createDownloadIntent(
      'private/4ad22eac-a5f4-475c-b180-948f81d75a67/3c87cd98-2e93-4dd4-8975-8b6d575639fc',
    );

    assert.match(intent.url, /^http:\/\/127\.0\.0\.1:8333\/best-private\//);
    assert.match(intent.url, /X-Amz-Signature=/);
    assert.match(intent.url, /X-Amz-Expires=300/);
    assert.ok(intent.expiresAt > new Date());
  } finally {
    storage.destroy();
  }
});

void test('rejects unsafe upload constraints before signing', async () => {
  const storage = new ObjectStorageClient(environment);

  try {
    await assert.rejects(
      storage.createUploadIntent({
        contentLength: environment.maxUploadBytes + 1,
        contentType: 'application/pdf\r\nx-unsafe:true',
        key: '../private/file',
      }),
      StorageInputError,
    );
  } finally {
    storage.destroy();
  }
});
