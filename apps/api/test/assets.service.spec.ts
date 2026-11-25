import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaType,
} from '@best/database';
import { Test } from '@nestjs/testing';

import { AssetsService } from '../src/components/assets/assets.service';
import { AssetsStorageGateway } from '../src/components/assets/assets-storage.gateway';
import {
  MalwareScannerGateway,
  type MalwareScanResult,
} from '../src/components/assets/malware-scanner.gateway';
import { DatabaseService } from '../src/database/database.service';
import { ApplicationError } from '../src/libs/errors/application.error';
import { ErrorCode } from '../src/libs/enums/error-code.enum';

const owner = '00000000-0000-4000-8000-000000000001';
const ids = [10, 11, 12].map(
  (id) => `00000000-0000-4000-8000-${id.toString(16).padStart(12, '0')}`,
);
const clean: MalwareScanResult = {
  engine: 'CLAMAV',
  engineVersion: 'test',
  signatureVersion: 'test',
  status: 'CLEAN',
  threatName: null,
};
const pdf = Buffer.from('%PDF-fictional');

function gate() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    promise,
    release: () => {
      resolve();
    },
  };
}

async function fixture(context: TestContext) {
  const records = new Map(
    ids.map((id) => [
      id,
      {
        id,
        checksumSha256: null,
        malwareScannedAt: null,
        malwareStatus: MediaMalwareStatus.PENDING,
        mediaType: MediaType.PDF,
        mimeType: 'application/pdf',
        objectKey: `private/${owner}/${id}`,
        originalName: 'fictional.pdf',
        sizeBytes: null,
        status: MediaObjectStatus.PENDING_UPLOAD,
        uploadExpiresAt: new Date(Date.now() + 60_000),
        verifiedAt: null,
      },
    ]),
  );
  let reads = 0;
  let scans = 0;
  let read = () => Promise.resolve<Uint8Array>(pdf);
  let scan: () => Promise<MalwareScanResult> = () => Promise.resolve(clean);
  const module = await Test.createTestingModule({
    providers: [
      AssetsService,
      {
        provide: DatabaseService,
        useValue: {
          mediaObject: {
            findFirst: ({
              where,
            }: {
              where: { id: string; createdById: string };
            }) =>
              Promise.resolve(
                where.createdById === owner
                  ? (records.get(where.id.toLowerCase()) ?? null)
                  : null,
              ),
            updateMany: ({
              where,
              data,
            }: {
              where: { id: string };
              data: object;
            }) => {
              const record = records.get(where.id);
              if (!record) return Promise.resolve({ count: 0 });
              Object.assign(record, data);
              return Promise.resolve({ count: 1 });
            },
          },
        },
      },
      {
        provide: AssetsStorageGateway,
        useValue: {
          maxUploadBytes: 1_000,
          bucket: 'fictional',
          inspectObject: () =>
            Promise.resolve({
              contentLength: pdf.byteLength,
              contentType: 'application/pdf',
              etag: 'fictional',
            }),
          readObject: () => {
            reads++;
            return read();
          },
        },
      },
      {
        provide: MalwareScannerGateway,
        useValue: {
          scan: () => {
            scans++;
            return scan();
          },
        },
      },
    ],
  }).compile();
  context.after(() => module.close());
  return {
    service: module.get(AssetsService),
    id: (index: number) => {
      const id = ids[index];
      assert.ok(id);
      return id;
    },
    reads: () => reads,
    scans: () => scans,
    setRead: (handler: typeof read) => {
      read = handler;
    },
    setScan: (handler: typeof scan) => {
      scan = handler;
    },
  };
}

const unavailable = (error: unknown) =>
  error instanceof ApplicationError &&
  error.code === ErrorCode.SERVICE_UNAVAILABLE;

void test('simultaneous owner confirmations share one read and scan; other owners remain excluded', async (context) => {
  const f = await fixture(context);
  const entered = gate();
  const blocked = gate();
  context.after(blocked.release);
  f.setScan(async () => {
    entered.release();
    await blocked.promise;
    return clean;
  });
  const first = f.service.confirmMediaUpload(owner, f.id(0));
  const racing = f.service.confirmMediaUpload(owner, f.id(0).toUpperCase());
  await entered.promise;
  const duplicate = f.service.confirmMediaUpload(owner, f.id(0));
  await assert.rejects(
    f.service.confirmMediaUpload(f.id(2), f.id(0)),
    (error: unknown) =>
      error instanceof ApplicationError && error.code === ErrorCode.NOT_FOUND,
  );
  blocked.release();
  const results = await Promise.all([first, racing, duplicate]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].status, MediaObjectStatus.READY);
  assert.equal(results[0].malwareStatus, MediaMalwareStatus.CLEAN);
  await f.service.confirmMediaUpload(owner, f.id(0));
  assert.equal(f.reads(), 1);
  assert.equal(f.scans(), 1);
});

void test('verification limit applies before reading objects and releases slots after storage failure', async (context) => {
  const f = await fixture(context);
  const entered = gate();
  const blocked = gate();
  context.after(blocked.release);
  f.setRead(async () => {
    if (f.reads() === 2) entered.release();
    await blocked.promise;
    throw new Error('fictional storage failure');
  });
  const first = assert.rejects(
    f.service.confirmMediaUpload(owner, f.id(0)),
    unavailable,
  );
  const second = assert.rejects(
    f.service.confirmMediaUpload(owner, f.id(1)),
    unavailable,
  );
  await entered.promise;
  await assert.rejects(
    f.service.confirmMediaUpload(owner, f.id(2)),
    unavailable,
  );
  assert.equal(f.reads(), 2);
  assert.equal(f.scans(), 0);
  blocked.release();
  await Promise.all([first, second]);
  f.setRead(() => Promise.resolve(pdf));
  await f.service.confirmMediaUpload(owner, f.id(0));
  await f.service.confirmMediaUpload(owner, f.id(2));
  assert.equal(f.scans(), 2);
});

void test('scan failure is retryable and infected files remain rejected', async (context) => {
  const f = await fixture(context);
  f.setScan(() => Promise.reject(new Error('fictional scanner outage')));
  await assert.rejects(
    f.service.confirmMediaUpload(owner, f.id(0)),
    unavailable,
  );
  f.setScan(() =>
    Promise.resolve({
      ...clean,
      status: 'INFECTED',
      threatName: 'Fictional-Test',
    }),
  );
  await assert.rejects(
    f.service.confirmMediaUpload(owner, f.id(0)),
    (error: unknown) =>
      error instanceof ApplicationError &&
      error.code === ErrorCode.BAD_USER_INPUT,
  );
  f.setScan(() => Promise.resolve(clean));
  await assert.rejects(
    f.service.confirmMediaUpload(owner, f.id(0)),
    (error: unknown) =>
      error instanceof ApplicationError && error.code === ErrorCode.CONFLICT,
  );
  assert.equal(f.scans(), 2);
  await f.service.confirmMediaUpload(owner, f.id(1));
});
