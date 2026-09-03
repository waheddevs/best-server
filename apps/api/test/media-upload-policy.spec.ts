import assert from 'node:assert/strict';
import test from 'node:test';

import { MediaType } from '@best/database';

import { ApplicationError } from '../src/libs/errors/application.error';
import {
  getMediaUploadPolicy,
  validateMediaUpload,
} from '../src/components/assets/media-upload-policy';

const CONFIGURED_MAX_BYTES = 52_428_800;

void test('derives the media type from an allowlisted MIME and extension', () => {
  const upload = validateMediaUpload(
    {
      mimeType: ' Application/PDF ',
      originalName: ' Lesson.PDF ',
      sizeBytes: 1_024,
    },
    CONFIGURED_MAX_BYTES,
  );

  assert.equal(upload.mediaType, MediaType.PDF);
  assert.equal(upload.mimeType, 'application/pdf');
  assert.equal(upload.originalName, 'Lesson.PDF');
});

void test('rejects unsafe names, extension mismatches, and oversized images', () => {
  assert.throws(
    () =>
      validateMediaUpload(
        {
          mimeType: 'application/pdf',
          originalName: '../lesson.pdf',
          sizeBytes: 1_024,
        },
        CONFIGURED_MAX_BYTES,
      ),
    ApplicationError,
  );
  assert.throws(
    () =>
      validateMediaUpload(
        {
          mimeType: 'application/pdf',
          originalName: 'lesson.png',
          sizeBytes: 1_024,
        },
        CONFIGURED_MAX_BYTES,
      ),
    ApplicationError,
  );
  assert.throws(
    () =>
      validateMediaUpload(
        {
          mimeType: 'image/png',
          originalName: 'photo.png',
          sizeBytes: 10 * 1_048_576 + 1,
        },
        CONFIGURED_MAX_BYTES,
      ),
    ApplicationError,
  );
});

void test('matches trusted file signatures instead of filename text', () => {
  assert.equal(
    getMediaUploadPolicy('application/pdf').signatureMatches(
      Buffer.from('%PDF-1.7'),
    ),
    true,
  );
  assert.equal(
    getMediaUploadPolicy('image/png').signatureMatches(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    true,
  );
  assert.equal(
    getMediaUploadPolicy('video/mp4').signatureMatches(
      Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
    ),
    true,
  );
  assert.equal(
    getMediaUploadPolicy('application/pdf').signatureMatches(
      Buffer.from('not a pdf'),
    ),
    false,
  );
});
