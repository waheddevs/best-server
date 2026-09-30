import type {
  DownloadIntent,
  StoredObjectMetadata,
  StoredObjectInput,
  UploadIntent,
  UploadIntentInput,
} from '@best/storage';

export abstract class AssetsStorageGateway {
  abstract readonly bucket: string;
  abstract readonly maxUploadBytes: number;

  abstract createUploadIntent(input: UploadIntentInput): Promise<UploadIntent>;
  abstract createDownloadIntent(key: string): Promise<DownloadIntent>;
  abstract inspectObject(key: string): Promise<StoredObjectMetadata>;
  abstract writeObject(input: StoredObjectInput): Promise<void>;
  abstract readObject(
    key: string,
    etag: string,
    maxBytes: number,
  ): Promise<Uint8Array>;
}
