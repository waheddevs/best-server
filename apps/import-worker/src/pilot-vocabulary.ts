import { createApplicationLogger } from '@best/logger';
import { NestFactory } from '@nestjs/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { ImportWorkerModule } from './import-worker.module';
import type { VocabularyPilotInput } from './pilot/pilot.type';
import { VocabularyPilotService } from './pilot/vocabulary-pilot.service';

const logger = createApplicationLogger({
  format: process.env.NODE_ENV === 'development' ? 'pretty' : 'json',
  service: 'best-import-pilot',
});

async function run(): Promise<void> {
  const command = parseArguments(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(ImportWorkerModule, {
    logger,
  });

  try {
    const service = app.get(VocabularyPilotService);
    const result =
      command.actorId === undefined
        ? await service.run(command.input)
        : await service.runAndPersist(command.input, command.actorId);
    const outputPath = resolve(command.outputPath);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, undefined, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    logger.log({
      entries: result.draft.entries.length,
      event: 'vocabulary_import_pilot_completed',
      extractionMethod: result.document.extractionMethod,
      ignoredLines: result.draft.ignoredLines.length,
      outputPath,
      pageCount: result.document.pageCount,
      rightsReviewStatus: result.rightsReview.status,
      stored: 'persistence' in result,
    });
  } finally {
    await app.close();
  }
}

interface PilotCommand {
  readonly actorId: string | undefined;
  readonly input: VocabularyPilotInput;
  readonly outputPath: string;
}

function parseArguments(arguments_: readonly string[]): PilotCommand {
  const values = new Map<string, string>();

  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];

    if (key === undefined || !key.startsWith('--') || value === undefined) {
      throw new Error('Pilot arguments must use --name value pairs');
    }

    values.set(key.slice(2), value);
  }

  const actorId = values.get('actor-id')?.trim();

  return {
    actorId: actorId === '' ? undefined : actorId,
    input: {
      channelId: requireArgument(values, 'channel'),
      contentMessageId: requireArgument(values, 'content-message'),
      exportPath: requireArgument(values, 'export'),
      mediaMessageId: requireArgument(values, 'media-message'),
    },
    outputPath: requireArgument(values, 'output'),
  };
}

function requireArgument(
  values: ReadonlyMap<string, string>,
  name: string,
): string {
  const value = values.get(name)?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required --${name} argument`);
  }

  return value;
}

void run().catch((error: unknown) => {
  logger.error({
    error: error instanceof Error ? error.message : 'Unknown failure',
    event: 'vocabulary_import_pilot_failed',
  });
  process.exitCode = 1;
});
