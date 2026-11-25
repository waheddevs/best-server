import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { TestContext } from 'node:test';
import type { RequestListener } from 'node:http';

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

async function storageServer(context: TestContext, handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const storage = new ObjectStorageClient({
    ...environment,
    endpoint: `http://127.0.0.1:${String(address.port)}`,
  });
  context.after(async () => {
    storage.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  });
  return storage;
}

void test('reads a chunked object exactly at the limit with its ETag condition', async (context) => {
  const storage = await storageServer(context, (request, response) => {
    assert.equal(request.headers['if-match'], '"fictional-etag"');
    response.writeHead(200);
    response.write(Buffer.from([1, 2]));
    setImmediate(() => response.end(Buffer.from([3, 4])));
  });
  assert.deepEqual(
    await storage.readObject('private/fictional', '"fictional-etag"', 4),
    new Uint8Array([1, 2, 3, 4]),
  );
});

void test(
  'cancels an oversized chunked body before the server finishes sending',
  { timeout: 3_000 },
  async (context) => {
    let resolveClosed: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const storage = await storageServer(context, (_request, response) => {
      response.once('close', resolveClosed);
      response.writeHead(200);
      response.write(Buffer.alloc(4));
      setImmediate(() => response.write(Buffer.alloc(4)));
      // Deliberately never finish: the client must cancel as soon as the limit is exceeded.
    });
    await assert.rejects(
      storage.readObject('private/fictional', 'test', 5),
      StorageInputError,
    );
    await closed;
  },
);

void test(
  'rejects oversized Content-Length without draining the body',
  { timeout: 3_000 },
  async (context) => {
    let resolveClosed: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const storage = await storageServer(context, (_request, response) => {
      response.once('close', resolveClosed);
      response.writeHead(200, { 'Content-Length': '1000' });
      response.write(Buffer.alloc(1));
    });
    await assert.rejects(
      storage.readObject('private/fictional', 'test', 5),
      StorageInputError,
    );
    await closed;
  },
);

void test('rejects an interrupted object body instead of returning partial bytes', async (context) => {
  const storage = await storageServer(context, (_request, response) => {
    response.writeHead(200, { 'Content-Length': '10' });
    response.write(Buffer.alloc(1));
    setImmediate(() => response.destroy());
  });
  await assert.rejects(storage.readObject('private/fictional', 'test', 10));
});

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

void test('signs for the public origin while bucket checks use the internal endpoint', async () => {
  const server = createServer((request, response) => {
    assert.equal(request.method, 'HEAD');
    response.writeHead(200).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const storage = new ObjectStorageClient({
    ...environment,
    endpoint: `http://127.0.0.1:${String(address.port)}`,
    publicEndpoint: 'https://media.example.test:3102',
  });
  try {
    await storage.assertBucketAvailable();
    const key =
      'private/4ad22eac-a5f4-475c-b180-948f81d75a67/3c87cd98-2e93-4dd4-8975-8b6d575639fc';
    const download = await storage.createDownloadIntent(key);
    const upload = await storage.createUploadIntent({
      key,
      contentLength: 12,
      contentType: 'text/plain',
    });
    for (const intent of [download, upload]) {
      const url = new URL(intent.url);
      assert.equal(url.origin, 'https://media.example.test:3102');
      assert.equal(url.pathname, `/best-private/${key}`);
      assert.ok(url.searchParams.get('X-Amz-Signature'));
    }
  } finally {
    storage.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  }
});
