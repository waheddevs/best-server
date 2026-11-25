import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
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

export interface ListeningAudioWorker {
  postMessage(request: ListeningAudioWorkerRequest): void;
  on(event: 'message', listener: (message: unknown) => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'exit', listener: (code: number) => void): unknown;
  terminate(): Promise<number>;
}

interface PendingGeneration {
  readonly id: string;
  readonly transcript: string;
  readonly deadline: number;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly reject: (error: Error) => void;
  readonly resolve: (audio: GeneratedListeningAudio) => void;
}

export class KokoroListeningAudioGateway
  extends ListeningAudioGateway
  implements OnApplicationShutdown
{
  readonly maxTranscriptCharacters: number;
  private readonly logger = new Logger(KokoroListeningAudioGateway.name);
  private readonly queue: PendingGeneration[] = [];
  private active: PendingGeneration | undefined;
  private shuttingDown = false;
  private unavailable = false;
  private worker: ListeningAudioWorker | undefined;
  private retiringWorker: Promise<void> | undefined;

  constructor(
    private readonly environment: TextToSpeechEnvironment,
    private readonly createWorker: () => ListeningAudioWorker = () =>
      new Worker(join(__dirname, 'kokoro-listening-audio.worker.js')),
  ) {
    super();
    this.maxTranscriptCharacters = environment.maxTranscriptCharacters;
  }

  generate(transcript: string): Promise<GeneratedListeningAudio> {
    if (this.shuttingDown || this.unavailable) {
      return Promise.reject(
        new ListeningAudioProviderError(
          'Local Kokoro audio generation is unavailable',
        ),
      );
    }
    if (
      transcript.length > this.maxTranscriptCharacters ||
      transcript.trim().length === 0
    ) {
      return Promise.reject(
        new ListeningAudioProviderError(
          'The listening transcript exceeds the allowed bounds',
        ),
      );
    }
    if (
      (this.active !== undefined || this.retiringWorker !== undefined) &&
      this.queue.length >= this.environment.maxQueuedGenerations
    ) {
      return Promise.reject(
        new ListeningAudioProviderError(
          'Local Kokoro audio generation is busy. Retry later.',
        ),
      );
    }
    return new Promise<GeneratedListeningAudio>((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.expire(id);
      }, this.environment.generationTimeoutMilliseconds);
      this.queue.push({
        id,
        transcript,
        timer,
        resolve,
        reject,
        deadline:
          performance.now() + this.environment.generationTimeoutMilliseconds,
      });
      this.processNext();
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    const error = new ListeningAudioProviderError(
      'Local Kokoro audio generation stopped during API shutdown',
    );
    if (this.active !== undefined) {
      this.rejectGeneration(this.active, error);
      this.active = undefined;
    }
    this.rejectQueued(error);
    const worker = this.worker;
    this.worker = undefined;
    if (worker !== undefined) await this.retireWorker(worker);
    else await this.retiringWorker;
  }

  private processNext(): void {
    if (
      this.active !== undefined ||
      this.retiringWorker !== undefined ||
      this.shuttingDown ||
      this.unavailable
    )
      return;
    const next = this.queue.shift();
    if (next === undefined) return;
    if (performance.now() >= next.deadline) {
      this.rejectGeneration(
        next,
        new ListeningAudioProviderError(
          'Local Kokoro audio generation timed out',
        ),
      );
      this.processNext();
      return;
    }
    this.active = next;
    try {
      this.requireWorker().postMessage({
        id: next.id,
        transcript: next.transcript,
      });
    } catch (error: unknown) {
      const worker = this.worker;
      if (worker !== undefined) this.handleWorkerFailure(worker);
      else {
        this.active = undefined;
        this.rejectGeneration(
          next,
          new ListeningAudioProviderError(
            'Local Kokoro audio generation could not be started',
            { cause: error },
          ),
        );
        this.processNext();
      }
    }
  }

  private expire(id: string): void {
    const error = new ListeningAudioProviderError(
      'Local Kokoro audio generation timed out',
    );
    if (this.active?.id === id) {
      const active = this.active;
      this.active = undefined;
      this.rejectGeneration(active, error);
      const worker = this.worker;
      this.worker = undefined;
      if (worker !== undefined) void this.retireWorker(worker);
      else this.processNext();
      return;
    }
    const index = this.queue.findIndex((pending) => pending.id === id);
    if (index >= 0) {
      const [pending] = this.queue.splice(index, 1);
      if (pending !== undefined) this.rejectGeneration(pending, error);
    }
  }

  private requireWorker(): ListeningAudioWorker {
    if (this.worker !== undefined) return this.worker;
    const worker = this.createWorker();
    this.worker = worker;
    worker.on('message', (message: unknown) => {
      this.handleWorkerMessage(worker, message);
    });
    worker.once('error', () => {
      this.handleWorkerFailure(worker);
    });
    worker.once('exit', () => {
      this.handleWorkerFailure(worker);
    });
    return worker;
  }

  private handleWorkerMessage(
    worker: ListeningAudioWorker,
    message: unknown,
  ): void {
    if (this.worker !== worker) return;
    if (!isListeningAudioWorkerResponse(message)) {
      this.handleWorkerFailure(worker);
      return;
    }
    const active = this.active;
    if (active?.id !== message.id) return;
    if (performance.now() >= active.deadline) {
      this.expire(active.id);
      return;
    }
    this.active = undefined;
    clearTimeout(active.timer);
    if (message.kind === 'failure') {
      active.reject(
        new ListeningAudioProviderError('Local Kokoro audio generation failed'),
      );
    } else active.resolve(mapWorkerResponse(message));
    this.processNext();
  }

  private handleWorkerFailure(worker: ListeningAudioWorker): void {
    if (this.worker !== worker) return;
    this.worker = undefined;
    if (this.active !== undefined) {
      this.rejectGeneration(
        this.active,
        new ListeningAudioProviderError('Local Kokoro audio generation failed'),
      );
      this.active = undefined;
    }
    void this.retireWorker(worker);
  }

  private retireWorker(worker: ListeningAudioWorker): Promise<void> {
    const retirement = Promise.resolve()
      .then(() => worker.terminate())
      .then(
        () => undefined,
        () => {
          this.unavailable = true;
          this.rejectQueued(
            new ListeningAudioProviderError(
              'Local Kokoro audio generation is unavailable',
            ),
          );
          this.logger.error('Local Kokoro worker could not be stopped');
        },
      );
    this.retiringWorker = retirement;
    void retirement.then(() => {
      if (this.retiringWorker === retirement) this.retiringWorker = undefined;
      this.processNext();
    });
    return retirement;
  }

  private rejectGeneration(pending: PendingGeneration, error: Error): void {
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private rejectQueued(error: Error): void {
    for (const pending of this.queue.splice(0))
      this.rejectGeneration(pending, error);
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
