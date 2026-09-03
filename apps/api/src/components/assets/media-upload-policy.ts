import { MediaType } from '@best/database';

import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import type { CreateMediaUploadIntentInput } from '../../schemas/assets/create-media-upload-intent.input';

interface MediaUploadPolicy {
  readonly extensions: readonly string[];
  readonly maxBytes: number;
  readonly mediaType: MediaType;
  readonly signatureMatches: (bytes: Uint8Array) => boolean;
}

export interface ValidatedMediaUpload {
  readonly maxBytes: number;
  readonly mediaType: MediaType;
  readonly mimeType: string;
  readonly originalName: string;
  readonly sizeBytes: number;
}

const MEBIBYTE = 1_048_576;
const IMAGE_MAX_BYTES = 10 * MEBIBYTE;
const GENERAL_MAX_BYTES = 50 * MEBIBYTE;

const MEDIA_UPLOAD_POLICIES: Readonly<Record<string, MediaUploadPolicy>> = {
  'application/pdf': {
    extensions: ['pdf'],
    maxBytes: GENERAL_MAX_BYTES,
    mediaType: MediaType.PDF,
    signatureMatches: (bytes) => startsWithAscii(bytes, '%PDF-'),
  },
  'audio/mpeg': {
    extensions: ['mp3'],
    maxBytes: GENERAL_MAX_BYTES,
    mediaType: MediaType.AUDIO,
    signatureMatches: isMp3,
  },
  'audio/ogg': {
    extensions: ['oga', 'ogg'],
    maxBytes: GENERAL_MAX_BYTES,
    mediaType: MediaType.AUDIO,
    signatureMatches: (bytes) => startsWithAscii(bytes, 'OggS'),
  },
  'audio/wav': {
    extensions: ['wav'],
    maxBytes: GENERAL_MAX_BYTES,
    mediaType: MediaType.AUDIO,
    signatureMatches: (bytes) =>
      startsWithAscii(bytes, 'RIFF') && hasAsciiAt(bytes, 'WAVE', 8),
  },
  'image/jpeg': {
    extensions: ['jpeg', 'jpg'],
    maxBytes: IMAGE_MAX_BYTES,
    mediaType: MediaType.IMAGE,
    signatureMatches: (bytes) =>
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  'image/png': {
    extensions: ['png'],
    maxBytes: IMAGE_MAX_BYTES,
    mediaType: MediaType.IMAGE,
    signatureMatches: (bytes) =>
      startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  'image/webp': {
    extensions: ['webp'],
    maxBytes: IMAGE_MAX_BYTES,
    mediaType: MediaType.IMAGE,
    signatureMatches: (bytes) =>
      startsWithAscii(bytes, 'RIFF') && hasAsciiAt(bytes, 'WEBP', 8),
  },
  'video/mp4': {
    extensions: ['m4v', 'mp4'],
    maxBytes: GENERAL_MAX_BYTES,
    mediaType: MediaType.VIDEO,
    signatureMatches: (bytes) => hasAsciiAt(bytes, 'ftyp', 4),
  },
  'video/webm': {
    extensions: ['webm'],
    maxBytes: GENERAL_MAX_BYTES,
    mediaType: MediaType.VIDEO,
    signatureMatches: (bytes) =>
      startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]),
  },
};

export function validateMediaUpload(
  input: CreateMediaUploadIntentInput,
  configuredMaxBytes: number,
): ValidatedMediaUpload {
  const originalName = input.originalName.trim();
  assertOriginalName(originalName);
  const mimeType = input.mimeType.trim().toLowerCase();
  const policy = getMediaUploadPolicy(mimeType);
  const extension = originalName
    .slice(originalName.lastIndexOf('.') + 1)
    .toLowerCase();

  if (!policy.extensions.includes(extension)) {
    throw invalidUpload('The filename extension does not match the MIME type');
  }

  const maxBytes = Math.min(policy.maxBytes, configuredMaxBytes);

  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > maxBytes
  ) {
    throw invalidUpload(
      `The file size must be between 1 and ${String(maxBytes)} bytes`,
    );
  }

  return {
    maxBytes,
    mediaType: policy.mediaType,
    mimeType,
    originalName,
    sizeBytes: input.sizeBytes,
  };
}

export function getMediaUploadPolicy(mimeType: string): MediaUploadPolicy {
  const policy = MEDIA_UPLOAD_POLICIES[mimeType];

  if (policy === undefined) {
    throw invalidUpload('The MIME type is not allowed');
  }

  return policy;
}

function assertOriginalName(originalName: string): void {
  if (
    originalName.length === 0 ||
    originalName.length > 255 ||
    originalName.includes('/') ||
    originalName.includes('\\') ||
    hasControlCharacters(originalName) ||
    originalName.lastIndexOf('.') <= 0
  ) {
    throw invalidUpload('The original filename is invalid');
  }
}

function isMp3(bytes: Uint8Array): boolean {
  return (
    startsWithAscii(bytes, 'ID3') ||
    (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)
  );
}

function startsWithAscii(bytes: Uint8Array, signature: string): boolean {
  return hasAsciiAt(bytes, signature, 0);
}

function hasAsciiAt(
  bytes: Uint8Array,
  signature: string,
  offset: number,
): boolean {
  if (bytes.byteLength < offset + signature.length) {
    return false;
  }

  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function startsWithBytes(
  bytes: Uint8Array,
  signature: readonly number[],
): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit <= 31 || codeUnit === 127) {
      return true;
    }
  }

  return false;
}

function invalidUpload(message: string): ApplicationError {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}
