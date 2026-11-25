import type { GeneratedListeningAudio } from './listening-audio.gateway';

export interface ListeningAudioWorkerRequest {
  readonly id: string;
  readonly transcript: string;
}

interface ListeningAudioWorkerFailure {
  readonly id: string;
  readonly kind: 'failure';
  readonly message: string;
}

interface ListeningAudioWorkerSuccess extends GeneratedListeningAudio {
  readonly id: string;
  readonly kind: 'success';
}

export type ListeningAudioWorkerResponse =
  ListeningAudioWorkerFailure | ListeningAudioWorkerSuccess;

export function isListeningAudioWorkerRequest(
  value: unknown,
): value is ListeningAudioWorkerRequest {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.transcript === 'string';
}

export function isListeningAudioWorkerResponse(
  value: unknown,
): value is ListeningAudioWorkerResponse {
  if (!isRecord(value) || typeof value.id !== 'string') return false;

  if (value.kind === 'failure') return typeof value.message === 'string';
  return (
    value.kind === 'success' &&
    value.bytes instanceof Uint8Array &&
    typeof value.durationSeconds === 'number' &&
    typeof value.engine === 'string' &&
    typeof value.engineVersion === 'string' &&
    value.mimeType === 'audio/wav' &&
    typeof value.voice === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
