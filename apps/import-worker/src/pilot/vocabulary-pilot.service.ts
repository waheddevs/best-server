import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { PdfTextExtractorService } from './pdf-text-extractor.service';
import { PilotPersistenceService } from './pilot-persistence.service';
import type {
  PersistedVocabularyPilotResult,
  VocabularyPilotInput,
  VocabularyPilotResult,
} from './pilot.type';
import { TelegramExportReaderService } from './telegram-export-reader.service';
import { VocabularyDraftNormalizerService } from './vocabulary-draft-normalizer.service';

const KNOWN_BRANDS = ['Cambridge', 'Macmillan', 'Oxford', 'Pearson'] as const;

@Injectable()
export class VocabularyPilotService {
  constructor(
    private readonly pdfTextExtractor: PdfTextExtractorService,
    private readonly pilotPersistence: PilotPersistenceService,
    private readonly telegramExportReader: TelegramExportReaderService,
    private readonly vocabularyDraftNormalizer: VocabularyDraftNormalizerService,
  ) {}

  async runAndPersist(
    input: VocabularyPilotInput,
    actorId: string,
  ): Promise<PersistedVocabularyPilotResult> {
    const result = await this.run(input);
    const mediaMessage = await this.telegramExportReader.readMessage(
      input.exportPath,
      input.mediaMessageId,
    );
    const mediaPath = mediaMessage.media?.absolutePath;

    if (mediaPath === undefined) {
      throw new Error('Pilot media file path was not found');
    }

    const persistence = await this.pilotPersistence.persist({
      actorId,
      mediaPath,
      result,
    });

    return { ...result, persistence };
  }

  async run(input: VocabularyPilotInput): Promise<VocabularyPilotResult> {
    const [mediaMessage, contentMessage] = await Promise.all([
      this.telegramExportReader.readMessage(
        input.exportPath,
        input.mediaMessageId,
      ),
      this.telegramExportReader.readMessage(
        input.exportPath,
        input.contentMessageId,
      ),
    ]);
    const media = mediaMessage.media;

    if (media?.title.toLowerCase().endsWith('.pdf') !== true) {
      throw new Error('Pilot media message must contain a PDF file');
    }

    const bytes = await readFile(media.absolutePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const document = await this.pdfTextExtractor.extract(media.absolutePath);
    const draft = this.vocabularyDraftNormalizer.normalize(contentMessage.text);
    const detectedBrands = detectBrands(
      `${document.pages.map((page) => page.text).join('\n')}\n${contentMessage.text}`,
    );

    return {
      document: {
        characterCount: document.characterCount,
        extractionMethod: document.method,
        pageCount: document.pageCount,
      },
      draft,
      idempotencyKey: `${input.channelId}:${input.mediaMessageId}:${sha256}`,
      rightsReview: {
        detectedBrands,
        status: 'REVIEW_REQUIRED',
      },
      schemaVersion: 1,
      source: {
        channelId: input.channelId,
        channelTitle: mediaMessage.channelTitle,
        contentMessageId: input.contentMessageId,
        mediaMessageDate: mediaMessage.date,
        mediaMessageId: input.mediaMessageId,
        originalFileName: media.title,
        sha256,
      },
    };
  }
}

function detectBrands(value: string): readonly string[] {
  return KNOWN_BRANDS.filter((brand) =>
    value.toLocaleLowerCase('en').includes(brand.toLocaleLowerCase('en')),
  );
}
