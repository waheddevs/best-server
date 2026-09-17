import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeCursor,
  encodeCursor,
} from '../src/libs/pagination/cursor-pagination';

const CURSOR_ID = '123e4567-e89b-42d3-a456-426614174000';

void test('accepts omitted and null cursors for the first page', () => {
  assert.equal(decodeCursor(undefined), undefined);
  assert.equal(decodeCursor(null), undefined);
});

void test('decodes a valid opaque cursor and rejects malformed values', () => {
  assert.equal(decodeCursor(encodeCursor(CURSOR_ID)), CURSOR_ID);
  assert.throws(
    () => decodeCursor('invalid'),
    /after must be a valid opaque cursor/,
  );
});
