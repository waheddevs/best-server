import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorageEnvironment } from '@best/config';

import { assertStorageKey } from './object-key';
import { StorageInputError } from './storage-input.error';

export interface UploadIntentInput {
  readonly contentLength: number;
  readonly contentType: string;
  readonly key: string;
}

export interface UploadIntent {
  readonly contentLength: number;
  readonly contentType: string;
  readonly expiresAt: Date;
  readonly method: 'PUT';
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly url: string;
}

export interface DownloadIntent {
  readonly expiresAt: Date;
  readonly url: string;
}

export interface StoredObjectMetadata {
  readonly checksumSha256: string | undefined;
  readonly contentLength: number | undefined;
  readonly contentType: string | undefined;
  readonly etag: string | undefined;
  readonly lastModified: Date | undefined;
}

export interface StoredObjectInput {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly key: string;
}

const CONTENT_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

export class ObjectStorageClient {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor(private readonly environment: ObjectStorageEnvironment) {
    const configuration = {
      credentials: {
        accessKeyId: environment.accessKeyId,
        secretAccessKey: environment.secretAccessKey,
      },
      endpoint: environment.endpoint,
      forcePathStyle: environment.forcePathStyle,
      region: environment.region,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    };
    this.client = new S3Client(configuration);
    this.signingClient = environment.publicEndpoint
      ? new S3Client({ ...configuration, endpoint: environment.publicEndpoint })
      : this.client;
  }

  async assertBucketAvailable(): Promise<void> {
    await this.client.send(
      new HeadBucketCommand({ Bucket: this.environment.bucket }),
    );
  }

  async createUploadIntent({
    contentLength,
    contentType,
    key,
  }: UploadIntentInput): Promise<UploadIntent> {
    assertStorageKey(key);
    assertContentType(contentType);

    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 1 ||
      contentLength > this.environment.maxUploadBytes
    ) {
      throw new StorageInputError('Upload size exceeds the configured maximum');
    }

    const expiresIn = this.environment.uploadUrlTtlSeconds;
    const url = await getSignedUrl(
      this.signingClient,
      new PutObjectCommand({
        Bucket: this.environment.bucket,
        ContentLength: contentLength,
        ContentType: contentType,
        IfNoneMatch: '*',
        Key: key,
      }),
      { expiresIn },
    );

    return {
      contentLength,
      contentType,
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
      method: 'PUT',
      requiredHeaders: {
        'Content-Type': contentType,
        'If-None-Match': '*',
      },
      url,
    };
  }

  async createDownloadIntent(key: string): Promise<DownloadIntent> {
    assertStorageKey(key);
    const expiresIn = this.environment.downloadUrlTtlSeconds;
    const url = await getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.environment.bucket,
        Key: key,
      }),
      { expiresIn },
    );

    return {
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
      url,
    };
  }

  async writeObject({
    bytes,
    contentType,
    key,
  }: StoredObjectInput): Promise<void> {
    assertStorageKey(key);
    assertContentType(contentType);

    if (
      bytes.byteLength < 1 ||
      bytes.byteLength > this.environment.maxUploadBytes
    ) {
      throw new StorageInputError(
        'Stored object size exceeds the configured maximum',
      );
    }

    await this.client.send(
      new PutObjectCommand({
        Body: bytes,
        Bucket: this.environment.bucket,
        ContentLength: bytes.byteLength,
        ContentType: contentType,
        IfNoneMatch: '*',
        Key: key,
      }),
    );
  }

  async inspectObject(key: string): Promise<StoredObjectMetadata> {
    assertStorageKey(key);
    const result = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.environment.bucket,
        Key: key,
      }),
    );

    return {
      checksumSha256: result.ChecksumSHA256,
      contentLength: result.ContentLength,
      contentType: result.ContentType,
      etag: result.ETag,
      lastModified: result.LastModified,
    };
  }

  async readObject(
    key: string,
    etag: string,
    maxBytes: number,
  ): Promise<Uint8Array> {
    assertStorageKey(key);

    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new StorageInputError('Invalid object read limit');
    }

    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.environment.bucket,
        IfMatch: etag,
        Key: key,
      }),
    );

    if (result.Body === undefined) {
      throw new Error('Object storage returned an empty response body');
    }

    const bytes = await result.Body.transformToByteArray();

    if (bytes.byteLength > maxBytes) {
      throw new StorageInputError('Stored object exceeds the read limit');
    }

    return bytes;
  }

  destroy(): void {
    this.client.destroy();
    if (this.signingClient !== this.client) this.signingClient.destroy();
  }
}

function assertContentType(contentType: string): void {
  if (!CONTENT_TYPE_PATTERN.test(contentType)) {
    throw new StorageInputError('Invalid object content type');
  }
}
