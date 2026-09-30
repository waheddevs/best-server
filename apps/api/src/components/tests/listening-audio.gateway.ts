export interface GeneratedListeningAudio {
  readonly bytes: Uint8Array;
  readonly durationSeconds: number;
  readonly engine: string;
  readonly engineVersion: string;
  readonly mimeType: 'audio/wav';
  readonly voice: string;
}

export abstract class ListeningAudioGateway {
  abstract readonly maxTranscriptCharacters: number;

  abstract generate(transcript: string): Promise<GeneratedListeningAudio>;
}

export class ListeningAudioProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = ListeningAudioProviderError.name;
  }
}
