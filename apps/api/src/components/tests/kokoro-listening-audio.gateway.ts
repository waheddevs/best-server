import type { TextToSpeechEnvironment } from '@best/config';
import { Logger } from '@nestjs/common';
import { KokoroTTS, type GenerateOptions } from 'kokoro-js';

import {
  type GeneratedListeningAudio,
  ListeningAudioGateway,
  ListeningAudioProviderError,
} from './listening-audio.gateway';

const ENGINE = 'KOKORO_JS';
const ENGINE_VERSION = '1.2.1';
const MAX_GENERATED_AUDIO_BYTES = 52_428_800;
const MAX_SEGMENT_CHARACTERS = 220;
const PAUSE_SECONDS = 0.2;
const SPEECH_SPEED = 0.85;
const DIALOGUE_VOICE_CANDIDATES = [
  'bf_emma',
  'af_heart',
  'bm_george',
  'am_adam',
] as const;

interface SpeechSegment {
  text: string;
  voice: string;
}

export class KokoroListeningAudioGateway extends ListeningAudioGateway {
  readonly maxTranscriptCharacters: number;
  private generationTail = Promise.resolve();
  private readonly logger = new Logger(KokoroListeningAudioGateway.name);
  private modelPromise: Promise<KokoroTTS> | undefined;

  constructor(private readonly environment: TextToSpeechEnvironment) {
    super();
    this.maxTranscriptCharacters = environment.maxTranscriptCharacters;
  }

  async generate(transcript: string): Promise<GeneratedListeningAudio> {
    const generation = this.generationTail.then(() =>
      this.generateImmediately(transcript),
    );
    this.generationTail = generation.then(
      () => undefined,
      () => undefined,
    );

    return generation;
  }

  private async generateImmediately(
    transcript: string,
  ): Promise<GeneratedListeningAudio> {
    try {
      const textToSpeech = await this.loadModel();
      const voice = this.environment.defaultVoice;

      if (!(voice in textToSpeech.voices)) {
        throw new ListeningAudioProviderError(
          `The configured Kokoro voice is not supported: ${voice}`,
        );
      }

      const chunks: Float32Array[] = [];
      let sampleRate: number | undefined;
      let totalSamples = 0;

      for (const segment of createSpeechSegments(
        transcript,
        textToSpeech.voices,
        voice,
      )) {
        const generated = await textToSpeech.generate(segment.text, {
          speed: SPEECH_SPEED,
          voice: segment.voice as NonNullable<GenerateOptions['voice']>,
        });
        const chunk = Float32Array.from(generated.audio);

        if (sampleRate === undefined) {
          sampleRate = generated.sampling_rate;
        } else if (sampleRate !== generated.sampling_rate) {
          throw new ListeningAudioProviderError(
            'Kokoro returned inconsistent audio sample rates',
          );
        }

        chunks.push(chunk);
        totalSamples += chunk.length;
      }

      if (sampleRate === undefined || sampleRate < 1 || chunks.length < 1) {
        throw new ListeningAudioProviderError(
          'Kokoro did not return generated audio',
        );
      }

      const pauseSamples = Math.round(sampleRate * PAUSE_SECONDS);
      totalSamples += pauseSamples * Math.max(0, chunks.length - 1);

      if (totalSamples * 2 + 44 > MAX_GENERATED_AUDIO_BYTES) {
        throw new ListeningAudioProviderError(
          'The generated audio exceeds the supported size',
        );
      }

      const combined = new Float32Array(totalSamples);
      let offset = 0;

      chunks.forEach((chunk, index) => {
        combined.set(chunk, offset);
        offset += chunk.length;

        if (index < chunks.length - 1) {
          offset += pauseSamples;
        }
      });

      const durationSeconds = Math.ceil(combined.length / sampleRate);

      if (durationSeconds < 1 || durationSeconds > 7_200) {
        throw new ListeningAudioProviderError(
          'The generated audio duration is outside the supported range',
        );
      }

      return {
        bytes: encodePcm16Wav(combined, sampleRate),
        durationSeconds,
        engine: ENGINE,
        engineVersion: ENGINE_VERSION,
        mimeType: 'audio/wav',
        voice,
      };
    } catch (error: unknown) {
      if (error instanceof ListeningAudioProviderError) {
        throw error;
      }

      this.logger.error(
        'Local Kokoro audio generation failed',
        error instanceof Error ? error.stack : undefined,
      );

      throw new ListeningAudioProviderError(
        'Local Kokoro audio generation failed',
        { cause: error },
      );
    }
  }

  private loadModel(): Promise<KokoroTTS> {
    this.modelPromise ??= KokoroTTS.from_pretrained(this.environment.modelId, {
      device: 'cpu',
      dtype: this.environment.modelDtype,
    }).catch((error: unknown) => {
      this.modelPromise = undefined;
      throw error;
    });

    return this.modelPromise;
  }
}

export function createSpeechSegments(
  transcript: string,
  availableVoices: Readonly<Record<string, unknown>>,
  defaultVoice: string,
): SpeechSegment[] {
  const turns = parseDialogueTurns(transcript);
  if (new Set(turns.map(({ speaker }) => speaker)).size < 2) {
    return splitTranscript(transcript).map((text) => ({
      text,
      voice: defaultVoice,
    }));
  }

  const voicePool = [defaultVoice, ...DIALOGUE_VOICE_CANDIDATES]
    .filter((voice, index, voices) => voices.indexOf(voice) === index)
    .filter((voice) => voice in availableVoices);
  const speakerVoices = new Map<string, string>();

  return turns.flatMap(({ speaker, text }) => {
    const assignedVoice =
      speakerVoices.get(speaker) ??
      voicePool[speakerVoices.size % voicePool.length] ??
      defaultVoice;
    speakerVoices.set(speaker, assignedVoice);
    return splitTranscript(text).map((segment) => ({
      text: segment,
      voice: assignedVoice,
    }));
  });
}

function parseDialogueTurns(
  transcript: string,
): { speaker: string; text: string }[] {
  const turns: { speaker: string; text: string }[] = [];

  for (const rawLine of transcript.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([\p{L}][\p{L}\p{N} .'-]{0,39}):\s*(.+)$/u.exec(line);

    if (match?.[1] && match[2]) {
      turns.push({
        speaker: match[1].trim().toLocaleLowerCase('en'),
        text: match[2].trim(),
      });
      continue;
    }

    const previous = turns.at(-1);
    if (previous === undefined) return [];
    previous.text = `${previous.text} ${line}`;
  }

  return turns;
}

function splitTranscript(transcript: string): string[] {
  const segments: string[] = [];
  let remainder = transcript.replace(/\s+/gu, ' ').trim();

  while (remainder.length > MAX_SEGMENT_CHARACTERS) {
    let splitAt = 0;

    for (const boundary of ['. ', '? ', '! ', '; ', ': ']) {
      const boundaryIndex = remainder.lastIndexOf(
        boundary,
        MAX_SEGMENT_CHARACTERS,
      );

      if (boundaryIndex >= 0) {
        splitAt = Math.max(splitAt, boundaryIndex + 1);
      }
    }

    if (splitAt < MAX_SEGMENT_CHARACTERS / 2) {
      const whitespaceIndex = remainder.lastIndexOf(
        ' ',
        MAX_SEGMENT_CHARACTERS,
      );
      splitAt = whitespaceIndex > 0 ? whitespaceIndex : MAX_SEGMENT_CHARACTERS;
    }

    segments.push(remainder.slice(0, splitAt).trim());
    remainder = remainder.slice(splitAt).trim();
  }

  if (remainder.length > 0) {
    segments.push(remainder);
  }

  return segments;
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = samples.length * bytesPerSample;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);

  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, dataSize, true);

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    const pcmValue = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(44 + index * bytesPerSample, Math.round(pcmValue), true);
  });

  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}
