import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { ExtractedPdfDocument, ExtractedPdfPage } from './pilot.type';

const MINIMUM_TEXT_CHARACTERS_PER_DOCUMENT = 40;

@Injectable()
export class PdfTextExtractorService {
  async extract(filePath: string): Promise<ExtractedPdfDocument> {
    const file = await readFile(filePath);
    const loadingTask = getDocument({
      data: new Uint8Array(file),
      useSystemFonts: true,
    });
    const document = await loadingTask.promise;

    try {
      const pages: ExtractedPdfPage[] = [];

      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        let text = '';

        for (const item of content.items) {
          if (!('str' in item)) {
            continue;
          }

          text += item.str;
          text += item.hasEOL ? '\n' : ' ';
        }

        pages.push({
          pageNumber,
          text: normalizeExtractedText(text),
        });
      }

      const characterCount = pages.reduce(
        (total, page) => total + page.text.replaceAll(/\s/g, '').length,
        0,
      );

      return {
        characterCount,
        method:
          characterCount < MINIMUM_TEXT_CHARACTERS_PER_DOCUMENT
            ? 'OCR_REQUIRED'
            : 'EMBEDDED_TEXT',
        pageCount: document.numPages,
        pages,
      };
    } finally {
      await loadingTask.destroy();
    }
  }
}

function normalizeExtractedText(value: string): string {
  return value
    .replaceAll('\u0000', '')
    .split('\n')
    .map((line) => line.replaceAll(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
