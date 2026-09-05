import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import type { TelegramExportMedia, TelegramExportMessage } from './pilot.type';

const MESSAGE_ID_PATTERN = /^\d+$/;
const MESSAGE_BOUNDARY = '\n     <div class="message ';
const CHANNEL_TITLE_PATTERN =
  /<div class="page_header">[\s\S]*?<div class="text bold">\s*([\s\S]*?)\s*<\/div>/;
const MESSAGE_DATE_PATTERN = /class="pull_right date details" title="([^"]+)"/;
const PARSED_MESSAGE_DATE_PATTERN =
  /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2}) UTC([+-]\d{2}:\d{2})$/;
const MESSAGE_TEXT_PATTERN = /<div class="text">\s*([\s\S]*?)\s*<\/div>/;
const MEDIA_PATTERN =
  /<a class="media ([^"]+)" href="((?:files|photos)\/[^"]+)">[\s\S]*?<div class="title bold">\s*([\s\S]*?)\s*<\/div>/;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

@Injectable()
export class TelegramExportReaderService {
  async readMessage(
    exportPath: string,
    messageId: string,
  ): Promise<TelegramExportMessage> {
    if (!MESSAGE_ID_PATTERN.test(messageId)) {
      throw new Error('Telegram message ID must contain only digits');
    }

    const html = await readFile(exportPath, 'utf8');
    const block = extractMessageBlock(html, messageId);
    const media = extractMedia(block, exportPath);

    return {
      channelTitle: extractChannelTitle(html),
      date: extractMessageDate(block),
      id: messageId,
      media,
      text: extractMessageText(block),
    };
  }
}

function extractMessageBlock(html: string, messageId: string): string {
  const idMarker = `id="message${messageId}"`;
  const idIndex = html.indexOf(idMarker);

  if (idIndex === -1) {
    throw new Error(`Telegram message ${messageId} was not found`);
  }

  const blockStart = html.lastIndexOf('<div class="message ', idIndex);
  const nextBlockStart = html.indexOf(
    MESSAGE_BOUNDARY,
    idIndex + idMarker.length,
  );

  if (blockStart === -1) {
    throw new Error(`Telegram message ${messageId} has an invalid HTML block`);
  }

  return html.slice(
    blockStart,
    nextBlockStart === -1 ? html.length : nextBlockStart,
  );
}

function extractChannelTitle(html: string): string {
  const pageHeader = CHANNEL_TITLE_PATTERN.exec(html);

  return pageHeader === null
    ? 'Unknown Telegram channel'
    : htmlToPlainText(pageHeader[1] ?? '');
}

function extractMessageDate(block: string): string {
  const value = MESSAGE_DATE_PATTERN.exec(block)?.[1];

  if (value === undefined) {
    throw new Error('Telegram message date was not found');
  }

  const match = PARSED_MESSAGE_DATE_PATTERN.exec(value);

  if (match === null) {
    throw new Error('Telegram message date format is not supported');
  }

  const day = match[1];
  const month = match[2];
  const year = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6];
  const offset = match[7];

  if (
    day === undefined ||
    month === undefined ||
    year === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    offset === undefined
  ) {
    throw new Error('Telegram message date parts are incomplete');
  }

  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`,
  ).toISOString();
}

function extractMessageText(block: string): string {
  const textHtml = MESSAGE_TEXT_PATTERN.exec(block)?.[1];

  return textHtml === undefined ? '' : htmlToPlainText(textHtml);
}

function extractMedia(
  block: string,
  exportPath: string,
): TelegramExportMedia | undefined {
  const anchor = MEDIA_PATTERN.exec(block);

  if (anchor === null) {
    return undefined;
  }

  const mediaClass = anchor[1] ?? '';
  const relativePath = decodeHtmlEntities(anchor[2] ?? '');
  const title = htmlToPlainText(anchor[3] ?? '');
  const exportDirectory = dirname(resolve(exportPath));
  const absolutePath = resolve(exportDirectory, relativePath);
  const resolvedRelativePath = relative(exportDirectory, absolutePath);

  if (
    resolvedRelativePath.startsWith('..') ||
    isAbsolute(resolvedRelativePath)
  ) {
    throw new Error('Telegram media path leaves the export directory');
  }

  return {
    absolutePath,
    mediaClass,
    relativePath,
    title,
  };
}

function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replaceAll(/<br\s*\/?\s*>/gi, '\n')
      .replaceAll(/<[^>]+>/g, '')
      .replaceAll('\r', ''),
  )
    .split('\n')
    .map((line) => line.replaceAll(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function decodeHtmlEntities(value: string): string {
  return value.replaceAll(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, entityBody: string) => {
      if (entityBody.startsWith('#x')) {
        return decodeNumericEntity(entity, entityBody.slice(2), 16);
      }

      if (entityBody.startsWith('#')) {
        return decodeNumericEntity(entity, entityBody.slice(1), 10);
      }

      return NAMED_ENTITIES[entityBody.toLowerCase()] ?? entity;
    },
  );
}

function decodeNumericEntity(
  fallback: string,
  value: string,
  radix: number,
): string {
  const codePoint = Number.parseInt(value, radix);

  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }

  return String.fromCodePoint(codePoint);
}
