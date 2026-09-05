import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { TelegramExportReaderService } from '../src/pilot/telegram-export-reader.service';
import { VocabularyDraftNormalizerService } from '../src/pilot/vocabulary-draft-normalizer.service';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

void test('reads a Telegram export message and keeps media inside the export', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'best-import-pilot-'));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, 'files'));
  const exportPath = join(directory, 'messages.html');

  await writeFile(
    exportPath,
    `<!doctype html>
     <div class="page_header"><div class="text bold">Fake Channel</div></div>
     <div class="message default clearfix" id="message261">
       <div class="pull_right date details" title="01.05.2025 16:04:30 UTC+09:00"></div>
       <a class="media clearfix media_file" href="files/Unit 1.pdf">
         <div class="title bold">Unit 1.pdf</div>
       </a>
       <div class="text">Vocabulary &amp; family</div>
     </div>
     <div class="message default clearfix" id="message262"></div>`,
    'utf8',
  );

  const message = await new TelegramExportReaderService().readMessage(
    exportPath,
    '261',
  );

  assert.equal(message.channelTitle, 'Fake Channel');
  assert.equal(message.date, '2025-05-01T07:04:30.000Z');
  assert.equal(message.media?.relativePath, 'files/Unit 1.pdf');
  assert.equal(message.text, 'Vocabulary & family');
});

void test('rejects a Telegram media path that leaves the export directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'best-import-pilot-'));
  temporaryDirectories.push(directory);
  const exportPath = join(directory, 'messages.html');

  await writeFile(
    exportPath,
    `<!doctype html>
     <div class="page_header"><div class="text bold">Fake Channel</div></div>
     <div class="message default clearfix" id="message261">
       <div class="pull_right date details" title="01.05.2025 16:04:30 UTC+09:00"></div>
       <a class="media clearfix media_file" href="files/../../../secret.pdf">
         <div class="title bold">secret.pdf</div>
       </a>
     </div>`,
    'utf8',
  );

  await assert.rejects(
    new TelegramExportReaderService().readMessage(exportPath, '261'),
    /leaves the export directory/,
  );
});

void test('normalizes vocabulary into a review-only structured draft', () => {
  const normalizer = new VocabularyDraftNormalizerService();
  const result = normalizer.normalize(`
    Cambridge English Vocabulary in Use
    Unit 1. The family
    🔻 A. Family words
    • mother /ˈmʌðə/ – ona
    • father /ˈfɑːðə/ - ota
    B. Expressions
    Have you got any brothers and sisters?
  `);

  assert.equal(result.title, 'The family');
  assert.equal(result.publicationStatus, 'DRAFT');
  assert.deepEqual(result.entries, [
    {
      pronunciation: 'ˈmʌðə',
      section: 'Family words',
      term: 'mother',
      translation: 'ona',
    },
    {
      pronunciation: 'ˈfɑːðə',
      section: 'Family words',
      term: 'father',
      translation: 'ota',
    },
  ]);
  assert.deepEqual(result.ignoredLines, [
    'Have you got any brothers and sisters?',
  ]);
});
