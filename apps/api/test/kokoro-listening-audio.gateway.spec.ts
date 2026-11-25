import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { parseTextToSpeechEnvironment } from '@best/config';
import { KokoroListeningAudioGateway } from '../src/components/tests/audio/kokoro-listening-audio.gateway';
import type { ListeningAudioWorkerRequest } from '../src/components/tests/audio/listening-audio-worker.type';

import { createSpeechSegments } from '../src/components/tests/audio/kokoro-listening-audio.engine';

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

class FictionalAudioWorker extends EventEmitter {
  readonly requests: ListeningAudioWorkerRequest[] = [];
  terminations = 0;
  retirement = Promise.resolve(0);
  postMessage(request: ListeningAudioWorkerRequest): void {
    this.requests.push(request);
  }
  terminate(): Promise<number> {
    this.terminations++;
    return this.retirement;
  }
  complete(index = 0): void {
    const request = this.requests[index];
    assert.ok(request);
    this.emit('message', {
      id: request.id,
      kind: 'success',
      bytes: new Uint8Array(44),
      durationSeconds: 1,
      engine: 'FICTIONAL',
      engineVersion: 'test',
      mimeType: 'audio/wav',
      voice: 'bf_emma',
    });
  }
}

function audioFixture(maxQueuedGenerations = 1) {
  const workers: FictionalAudioWorker[] = [];
  const gateway = new KokoroListeningAudioGateway(
    {
      ...parseTextToSpeechEnvironment({}),
      generationTimeoutMilliseconds: 100_000,
      maxQueuedGenerations,
    },
    () => {
      const worker = new FictionalAudioWorker();
      workers.push(worker);
      return worker;
    },
  );
  return { workers, gateway };
}

void test('audio work is serialized and rejects admission beyond the bounded queue', async (context) => {
  const { gateway, workers } = audioFixture();
  context.after(() => gateway.onApplicationShutdown());
  const first = gateway.generate('First fictional transcript');
  const second = gateway.generate('Second fictional transcript');
  await assert.rejects(gateway.generate('Overflow'), /busy/);
  const worker = workers[0];
  assert.ok(worker);
  assert.equal(worker.requests.length, 1);
  worker.complete();
  await first;
  assert.equal(worker.requests.length, 2);
  worker.complete(1);
  await second;
  const third = gateway.generate('Slot reused');
  worker.complete(2);
  await third;
  assert.equal(workers.length, 1);
});

void test('audio timeout retires the old worker before a replacement can start', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { gateway, workers } = audioFixture();
  context.after(() => gateway.onApplicationShutdown());
  const first = gateway.generate('Fictional stalled transcript');
  const firstFailure = assert.rejects(first, /timed out/);
  const old = workers[0];
  assert.ok(old);
  let finishRetirement: (code: number) => void = () => undefined;
  old.retirement = new Promise<number>((resolve) => {
    finishRetirement = resolve;
  });
  context.mock.timers.tick(50_000);
  const second = gateway.generate('Fictional queued transcript');
  context.mock.timers.tick(50_000);
  await firstFailure;
  assert.equal(workers.length, 1);
  old.complete();
  finishRetirement(0);
  await setImmediate();
  assert.equal(old.terminations, 1);
  assert.equal(workers.length, 2);
  const replacement = workers[1];
  assert.ok(replacement);
  replacement.complete();
  await second;
});

void test('audio queue waiting consumes the same deadline and expired work never starts', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { gateway, workers } = audioFixture();
  context.after(() => gateway.onApplicationShutdown());
  const first = assert.rejects(gateway.generate('Stalled'), /timed out/);
  const second = assert.rejects(gateway.generate('Queued'), /timed out/);
  context.mock.timers.tick(100_000);
  await Promise.all([first, second]);
  await setImmediate();
  assert.equal(workers.length, 1);
  assert.equal(workers[0]?.requests.length, 1);
});

void test('malformed audio responses retire the worker and stale messages cannot settle another request', async (context) => {
  const { gateway, workers } = audioFixture();
  context.after(() => gateway.onApplicationShutdown());
  const first = assert.rejects(gateway.generate('First'), /failed/);
  const second = gateway.generate('Second');
  const old = workers[0];
  assert.ok(old);
  old.emit('message', { invalid: true });
  await first;
  await setImmediate();
  old.complete();
  const next = workers[1];
  assert.ok(next);
  assert.equal(next.requests.length, 1);
  next.complete();
  await second;
});

void test('audio shutdown rejects active and queued work and prevents further admission', async () => {
  const { gateway, workers } = audioFixture();
  const first = assert.rejects(gateway.generate('Active'), /shutdown/);
  const second = assert.rejects(gateway.generate('Queued'), /shutdown/);
  await gateway.onApplicationShutdown();
  await Promise.all([first, second]);
  assert.equal(workers[0]?.terminations, 1);
  await assert.rejects(gateway.generate('After shutdown'), /unavailable/);
});

void test('audio rejects oversized raw transcripts before starting a worker and permits zero queue capacity', async (context) => {
  const { gateway, workers } = audioFixture(0);
  context.after(() => gateway.onApplicationShutdown());
  await assert.rejects(gateway.generate(' '.repeat(8_001)), /bounds/);
  assert.equal(workers.length, 0);
  const active = gateway.generate('Fictional');
  await assert.rejects(gateway.generate('No waiting allowed'), /busy/);
  const worker = workers[0];
  assert.ok(worker);
  worker.complete();
  await active;
});
