import { StorageInputError } from './storage-input.error';

interface PrivateObjectKeyInput {
  readonly mediaObjectId: string;
  readonly ownerId: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPrivateObjectKey({
  mediaObjectId,
  ownerId,
}: PrivateObjectKeyInput): string {
  assertUuid(mediaObjectId, 'mediaObjectId');
  assertUuid(ownerId, 'ownerId');

  return `private/${ownerId}/${mediaObjectId}`;
}

export function assertStorageKey(key: string): void {
  if (
    key.length === 0 ||
    key.length > 1_024 ||
    key.startsWith('/') ||
    key.endsWith('/') ||
    key.includes('\\') ||
    key.includes('//') ||
    hasControlCharacters(key) ||
    key.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new StorageInputError('Invalid object storage key');
  }
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit <= 31 || codeUnit === 127) {
      return true;
    }
  }

  return false;
}

function assertUuid(value: string, fieldName: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new StorageInputError(`${fieldName} must be a UUID`);
  }
}
