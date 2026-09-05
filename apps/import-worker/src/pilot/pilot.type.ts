export interface TelegramExportMedia {
  readonly absolutePath: string;
  readonly mediaClass: string;
  readonly relativePath: string;
  readonly title: string;
}

export interface TelegramExportMessage {
  readonly channelTitle: string;
  readonly date: string;
  readonly id: string;
  readonly media: TelegramExportMedia | undefined;
  readonly text: string;
}

export type PdfExtractionMethod = 'EMBEDDED_TEXT' | 'OCR_REQUIRED';

export interface ExtractedPdfPage {
  readonly pageNumber: number;
  readonly text: string;
}

export interface ExtractedPdfDocument {
  readonly characterCount: number;
  readonly method: PdfExtractionMethod;
  readonly pageCount: number;
  readonly pages: readonly ExtractedPdfPage[];
}

export interface VocabularyDraftEntry {
  readonly pronunciation: string;
  readonly section: string;
  readonly term: string;
  readonly translation: string;
}

export interface VocabularyDraft {
  readonly entries: readonly VocabularyDraftEntry[];
  readonly ignoredLines: readonly string[];
  readonly publicationStatus: 'DRAFT';
  readonly title: string;
}

export interface VocabularyPilotInput {
  readonly channelId: string;
  readonly contentMessageId: string;
  readonly exportPath: string;
  readonly mediaMessageId: string;
}

export interface VocabularyPilotResult {
  readonly document: {
    readonly characterCount: number;
    readonly extractionMethod: PdfExtractionMethod;
    readonly pageCount: number;
  };
  readonly draft: VocabularyDraft;
  readonly idempotencyKey: string;
  readonly rightsReview: {
    readonly detectedBrands: readonly string[];
    readonly status: 'REVIEW_REQUIRED';
  };
  readonly schemaVersion: 1;
  readonly source: {
    readonly channelId: string;
    readonly channelTitle: string;
    readonly contentMessageId: string;
    readonly mediaMessageDate: string;
    readonly mediaMessageId: string;
    readonly originalFileName: string;
    readonly sha256: string;
  };
}

export interface VocabularyPilotPersistence {
  readonly created: boolean;
  readonly draftId: string;
  readonly entryCount: number;
  readonly malwareStatus: 'CLEAN' | 'INFECTED' | 'PENDING';
  readonly mediaObjectId: string;
  readonly mediaStatus: 'PENDING_UPLOAD' | 'READY' | 'REJECTED' | 'VERIFYING';
  readonly sourceDocumentId: string;
}

export interface PersistedVocabularyPilotResult extends VocabularyPilotResult {
  readonly persistence: VocabularyPilotPersistence;
}
