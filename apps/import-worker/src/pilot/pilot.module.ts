import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PdfTextExtractorService } from './pdf-text-extractor.service';
import { PilotObjectStorageService } from './pilot-object-storage.service';
import { PilotPersistenceService } from './pilot-persistence.service';
import { TelegramExportReaderService } from './telegram-export-reader.service';
import { VocabularyDraftNormalizerService } from './vocabulary-draft-normalizer.service';
import { VocabularyPilotService } from './vocabulary-pilot.service';

@Module({
  imports: [DatabaseModule],
  exports: [VocabularyPilotService],
  providers: [
    PdfTextExtractorService,
    TelegramExportReaderService,
    VocabularyDraftNormalizerService,
    VocabularyPilotService,
    PilotObjectStorageService,
    PilotPersistenceService,
  ],
})
export class PilotModule {}
