import { Injectable } from '@nestjs/common';

import type { VocabularyDraft, VocabularyDraftEntry } from './pilot.type';

const ENTRY_PATTERN = /^[•·]\s*(.+?)\s+\/([^/]+)\/\s*[\u2013\u2014-]\s*(.+)$/u;
const SECTION_PATTERN = /^(?:🔻\s*)?([A-Z])\.\s*(.+)$/u;
const UNIT_TITLE_PATTERN = /(?:^|\s)Unit\s+\d+[.:]\s*(.+)$/iu;

@Injectable()
export class VocabularyDraftNormalizerService {
  normalize(text: string): VocabularyDraft {
    const entries: VocabularyDraftEntry[] = [];
    const ignoredLines: string[] = [];
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    let section = 'General';
    let title = 'Untitled vocabulary draft';

    for (const line of lines) {
      const titleMatch = UNIT_TITLE_PATTERN.exec(line);

      if (titleMatch !== null) {
        title = nonEmptyOrFallback(titleMatch[1], title);
        continue;
      }

      const sectionMatch = SECTION_PATTERN.exec(line);

      if (sectionMatch !== null) {
        section = nonEmptyOrFallback(sectionMatch[2], section);
        continue;
      }

      const entryMatch = ENTRY_PATTERN.exec(line);

      if (entryMatch !== null) {
        const term = entryMatch[1]?.trim();
        const pronunciation = entryMatch[2]?.trim();
        const translation = entryMatch[3]?.trim();

        if (
          term !== undefined &&
          term.length > 0 &&
          pronunciation !== undefined &&
          pronunciation.length > 0 &&
          translation !== undefined &&
          translation.length > 0
        ) {
          entries.push({ pronunciation, section, term, translation });
          continue;
        }
      }

      if (!isSourceHeading(line)) {
        ignoredLines.push(line);
      }
    }

    if (entries.length === 0) {
      throw new Error('No vocabulary entries could be normalized');
    }

    return {
      entries,
      ignoredLines,
      publicationStatus: 'DRAFT',
      title,
    };
  }
}

function isSourceHeading(line: string): boolean {
  return /Cambridge|Oxford|Pearson|Macmillan|Vocabulary in Use/iu.test(line);
}

function nonEmptyOrFallback(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? fallback
    : normalized;
}
