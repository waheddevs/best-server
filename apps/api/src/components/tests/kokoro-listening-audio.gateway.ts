import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { TextToSpeechEnvironment } from '@best/config';
import { Logger, type OnApplicationShutdown } from '@nestjs/common';

import {
  type GeneratedListeningAudio,
  ListeningAudioGateway,
  ListeningAudioProviderError,
} from './listening-audio.gateway';
import {
  isListeningAudioWorkerResponse,
  type ListeningAudioWorkerRequest,
  type ListeningAudioWorkerResponse,
} from './listening-audio-worker.type';

interface PendingGeneration {
  readonly reject: (error: Error) => void;
  readonly resolve: (audio: GeneratedListeningAudio) => void;
}

export class KokoroListeningAudioGateway
  extends ListeningAudioGateway
  implements OnApplicationShutdown
{
  readonly maxTranscriptCharacters: number;
  private generationTail = Promise.resolve();
  private readonly logger = new Logger(KokoroListeningAudioGateway.name);
  private readonly pendingGenerations = new Map<string, PendingGeneration>();
  private shuttingDown = false;
  private worker: Worker | undefined;

  constructor(environment: TextToSpeechEnvironment) {
    super();
    this.maxTranscriptCharacters = environment.maxTranscriptCharacters;
  }

  async generate(transcript: string): Promise<GeneratedListeningAudio> {
    const generation = this.generationTail.then(() =>
      this.generateInWorker(transcript),
    );
    this.generationTail = generation.then(
      () => undefined,
      () => undefined,
    );

    return generation;
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    this.rejectPendingGenerations(
      new ListeningAudioProviderError(
        'Local Kokoro audio generation stopped during API shutdown',
      ),
    );

    const worker = this.worker;
    this.worker = undefined;
    if (worker !== undefined) await worker.terminate();
  }

  private generateInWorker(
    transcript: string,
  ): Promise<GeneratedListeningAudio> {
    if (this.shuttingDown) {
      return Promise.reject(
        new ListeningAudioProviderError(
          'Local Kokoro audio generation is unavailable during API shutdown',
        ),
      );
    }

    const id = randomUUID();
    const request: ListeningAudioWorkerRequest = { id, transcript };
    const worker = this.requireWorker();

    return new Promise<GeneratedListeningAudio>((resolve, reject) => {
      this.pendingGenerations.set(id, { reject, resolve });

      try {
        worker.postMessage(request);
      } catch (error: unknown) {
        this.pendingGenerations.delete(id);
        reject(
          new ListeningAudioProviderError(
            'Local Kokoro audio generation could not be started',
            { cause: error },
          ),
        );
      }
    });
  }

  private requireWorker(): Worker {
    if (this.worker !== undefined) return this.worker;

    const worker = new Worker(
      join(__dirname, 'kokoro-listening-audio.worker.js'),
    );
    worker.on('message', (message: unknown) => {
      this.handleWorkerMessage(worker, message);
    });
    worker.once('error', (error: Error) => {
      this.handleWorkerFailure(worker, error);
    });
    worker.once('exit', (code: number) => {
      if (this.worker !== worker || this.shuttingDown) return;
      this.handleWorkerFailure(
        worker,
        new Error(
          `Kokoro worker exited unexpectedly with code ${String(code)}`,
        ),
      );
    });
    this.worker = worker;
    return worker;
  }

  private handleWorkerMessage(worker: Worker, message: unknown): void {
    if (!isListeningAudioWorkerResponse(message)) {
      this.handleWorkerFailure(
        worker,
        new Error('Kokoro worker returned an invalid response'),
      );
      void worker.terminate();
      return;
    }

    const pending = this.pendingGenerations.get(message.id);
    if (pending === undefined) return;
    this.pendingGenerations.delete(message.id);

    if (message.kind === 'failure') {
      this.logger.error(
        `Local Kokoro audio generation failed: ${message.message}`,
      );
      pending.reject(
        new ListeningAudioProviderError('Local Kokoro audio generation failed'),
      );
      return;
    }

    pending.resolve(mapWorkerResponse(message));
  }

  private handleWorkerFailure(worker: Worker, error: Error): void {
    if (this.worker !== worker) return;
    this.worker = undefined;
    this.logger.error('Local Kokoro worker failed', error.stack);
    this.rejectPendingGenerations(
      new ListeningAudioProviderError('Local Kokoro audio generation failed', {
        cause: error,
      }),
    );
  }

  private rejectPendingGenerations(error: Error): void {
    for (const pending of this.pendingGenerations.values()) {
      pending.reject(error);
    }
    this.pendingGenerations.clear();
  }
}

function mapWorkerResponse(
  response: Extract<ListeningAudioWorkerResponse, { readonly kind: 'success' }>,
): GeneratedListeningAudio {
  return {
    bytes: response.bytes,
    durationSeconds: response.durationSeconds,
    engine: response.engine,
    engineVersion: response.engineVersion,
    mimeType: response.mimeType,
    voice: response.voice,
  };
}
