import { loadObjectStorageEnvironment } from '@best/config';
import {
  type DownloadIntent,
  ObjectStorageClient,
  type StoredObjectMetadata,
  type UploadIntent,
  type UploadIntentInput,
} from '@best/storage';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';

import { AssetsStorageGateway } from './assets-storage.gateway';

@Injectable()
export class S3AssetsStorageGateway
  extends AssetsStorageGateway
  implements OnModuleDestroy
{
  private readonly environment = loadObjectStorageEnvironment();
  private readonly client = new ObjectStorageClient(this.environment);

  readonly bucket = this.environment.bucket;
  readonly maxUploadBytes = this.environment.maxUploadBytes;

  createUploadIntent(input: UploadIntentInput): Promise<UploadIntent> {
    return this.client.createUploadIntent(input);
  }

  createDownloadIntent(key: string): Promise<DownloadIntent> {
    return this.client.createDownloadIntent(key);
  }

  inspectObject(key: string): Promise<StoredObjectMetadata> {
    return this.client.inspectObject(key);
  }

  readObject(key: string, etag: string, maxBytes: number): Promise<Uint8Array> {
    return this.client.readObject(key, etag, maxBytes);
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
