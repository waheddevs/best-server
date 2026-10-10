import { parentPort, type MessagePort } from 'node:worker_threads';

import { loadTextToSpeechEnvironment } from '@best/config';

import { KokoroListeningAudioEngine } from './kokoro-listening-audio.engine';
import {
  isListeningAudioWorkerRequest,
  type ListeningAudioWorkerRequest,
  type ListeningAudioWorkerResponse,
} from './listening-audio-worker.type';

const port = requireParentPort();
const engine = new KokoroListeningAudioEngine(loadTextToSpeechEnvironment());
let generationTail = Promise.resolve();

port.on('message', (message: unknown) => {
  if (!isListeningAudioWorkerRequest(message)) {
    throw new Error(
      'Kokoro listening audio worker received an invalid request',
    );
  }

  generationTail = generationTail.then(() => processRequest(message));
});

async function processRequest(
  request: ListeningAudioWorkerRequest,
): Promise<void> {
  try {
    const generated = await engine.generate(request.transcript);
    const response: ListeningAudioWorkerResponse = {
      ...generated,
      id: request.id,
      kind: 'success',
    };

    if (response.bytes.buffer instanceof ArrayBuffer) {
      port.postMessage(response, [response.bytes.buffer]);
    } else {
      port.postMessage(response);
    }
  } catch (error: unknown) {
    const response: ListeningAudioWorkerResponse = {
      id: request.id,
      kind: 'failure',
      message:
        error instanceof Error
          ? error.message
          : 'Unknown Kokoro audio generation failure',
    };
    port.postMessage(response);
  }
}

function requireParentPort(): MessagePort {
  if (parentPort === null) {
    throw new Error('Kokoro listening audio worker requires a parent port');
  }
  return parentPort;
}
