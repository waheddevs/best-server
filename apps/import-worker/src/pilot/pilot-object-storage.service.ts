import { loadObjectStorageEnvironment } from '@best/config';
import { ObjectStorageClient, type UploadIntent } from '@best/storage';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';

interface CreatePilotUploadIntentInput {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly key: string;
}

interface UploadPilotObjectInput extends CreatePilotUploadIntentInput {
  readonly intent: UploadIntent;
}

@Injectable()
export class PilotObjectStorageService implements OnModuleDestroy {
  private readonly environment = loadObjectStorageEnvironment();
  private readonly client = new ObjectStorageClient(this.environment);

  readonly bucket = this.environment.bucket;
  readonly maxUploadBytes = this.environment.maxUploadBytes;

  createUploadIntent({
    bytes,
    contentType,
    key,
  }: CreatePilotUploadIntentInput): Promise<UploadIntent> {
    return this.client.createUploadIntent({
      contentLength: bytes.byteLength,
      contentType,
      key,
    });
  }

  async upload({
    bytes,
    contentType,
    intent,
    key,
  }: UploadPilotObjectInput): Promise<void> {
    const response = await fetch(intent.url, {
      body: Uint8Array.from(bytes),
      headers: intent.requiredHeaders,
      method: intent.method,
    });

    if (!response.ok) {
      throw new Error(
        `Object storage rejected the pilot upload with status ${String(response.status)}`,
      );
    }

    const metadata = await this.client.inspectObject(key);

    if (
      metadata.contentLength !== bytes.byteLength ||
      metadata.contentType?.toLowerCase() !== contentType
    ) {
      throw new Error('Stored pilot object metadata does not match the source');
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
