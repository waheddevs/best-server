import assert from 'node:assert/strict';
import test from 'node:test';

import { createSpeechSegments } from '../src/components/tests/kokoro-listening-audio.gateway';

void test('assigns stable Kokoro voices to labelled dialogue speakers', () => {
  const segments = createSpeechSegments(
    [
      'Tutor: Let us review the research plan.',
      'Maya: I will contact the transport office.',
      'Daniel: I will prepare the bar chart.',
      'Maya: I will also check the final deadline.',
    ].join('\n'),
    { af_heart: {}, bf_emma: {}, bm_george: {} },
    'bf_emma',
  );

  assert.deepEqual(segments, [
    { text: 'Let us review the research plan.', voice: 'bf_emma' },
    { text: 'I will contact the transport office.', voice: 'af_heart' },
    { text: 'I will prepare the bar chart.', voice: 'bm_george' },
    { text: 'I will also check the final deadline.', voice: 'af_heart' },
  ]);
});

void test('keeps an ordinary transcript on the configured default voice', () => {
  assert.deepEqual(
    createSpeechSegments(
      'This is an ordinary listening transcript.',
      { bf_emma: {} },
      'bf_emma',
    ),
    [
      {
        text: 'This is an ordinary listening transcript.',
        voice: 'bf_emma',
      },
    ],
  );
});
