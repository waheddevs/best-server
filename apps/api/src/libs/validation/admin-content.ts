import type { Language, Prisma } from '@best/database';
import { directoryError } from '../pagination/admin-directory';
export function contentText(value: string | null | undefined, max = 30000) {
  const text = value?.trim() ?? '';
  if (text.length > max) throw directoryError('Text is too long');
  return text;
}
export function contentRequired(value: string, max = 240) {
  const text = contentText(value, max);
  if (!text) throw directoryError('Required text is missing');
  return text;
}
export function contentPath(value: string | null | undefined) {
  const path = contentText(value, 500);
  if (
    path &&
    (!path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('..') ||
      /[\\?#]/.test(path))
  )
    throw directoryError('Use an existing local media path');
  return path || null;
}
export function contentSlug(value: string) {
  const slug = contentRequired(value, 160);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw directoryError('Invalid slug');
  return slug;
}
export function contentTranslations(
  rows: { language: Language; title: string; description: string }[],
) {
  if (rows.length !== 3 || new Set(rows.map((x) => x.language)).size !== 3)
    throw directoryError('UZ, RU and EN translations are required');
  for (const row of rows) {
    contentRequired(row.title);
    contentRequired(row.description, 30000);
  }
}
export function contentList(rows: string[]) {
  if (rows.length > 100) throw directoryError('Too many content items');
  return rows.map((x) => contentRequired(x, 5000));
}
export function contentPosition(position: number) {
  if (!Number.isInteger(position) || position < 0 || position > 100000)
    throw directoryError('Invalid position');
  return position;
}
export function contentVersion(actual: Date, expected?: string) {
  if (actual.toISOString() !== expected)
    throw directoryError('Content changed; reload before saving', true);
}
export function contentCapacity(
  capacity: number | null | undefined,
  registered: number,
) {
  if (
    capacity != null &&
    (!Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 100000 ||
      capacity < registered)
  )
    throw directoryError(
      'Capacity is lower than registrations or invalid',
      true,
    );
  return capacity ?? null;
}
export async function contentAudit(
  tx: Prisma.TransactionClient,
  actorId: string,
  targetType: string,
  targetId: string,
  action: string,
) {
  await tx.auditLog.create({ data: { actorId, targetId, targetType, action } });
}

export function contentAt<T>(rows: readonly T[], index: number): T {
  const value = rows[index];
  if (value === undefined)
    throw directoryError('Content translations must match');
  return value;
}
