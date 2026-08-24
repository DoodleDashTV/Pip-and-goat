import { GOAT_SOURCE_OBJECT_KEY, GOAT_SOURCE_PREFIX, GOAT_SOURCE_RECEIPT_OBJECT_KEY } from './types';
import { validateGoatFilename } from './preflight';

export class CharacterSourceError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'CharacterSourceError';
  }
}

export function goatSourceObjectKey(): typeof GOAT_SOURCE_OBJECT_KEY {
  return GOAT_SOURCE_OBJECT_KEY;
}

export function assertCharacterSourceKey(key: string): void {
  if (key !== GOAT_SOURCE_OBJECT_KEY) {
    throw new CharacterSourceError(
      `Object key must be exactly ${GOAT_SOURCE_OBJECT_KEY}.`,
      'UNSAFE_OBJECT_KEY',
    );
  }
  if (key.includes('..') || key.startsWith('/') || key.includes('\\') || key.includes('\0')) {
    throw new CharacterSourceError('Object key is unsafe.', 'UNSAFE_OBJECT_KEY');
  }
  if (!key.startsWith('tivvlejoy-assets/characters/')) {
    throw new CharacterSourceError('Object key left the private TivvleJoy asset prefix.', 'UNSAFE_OBJECT_KEY');
  }
  if (!key.startsWith(`${GOAT_SOURCE_PREFIX}/`)) {
    throw new CharacterSourceError('Object key left the CHAR_GOAT_001 namespace.', 'UNSAFE_OBJECT_KEY');
  }
}

export function assertGoatMetadataKey(key: string): void {
  if (key === GOAT_SOURCE_OBJECT_KEY) {
    throw new CharacterSourceError(
      'Metadata writes cannot target the immutable Goat ZIP.',
      'SOURCE_OVERWRITE_REFUSED',
    );
  }
  if (key.includes('..') || key.startsWith('/') || key.includes('\\') || key.includes('\0')) {
    throw new CharacterSourceError('Metadata key is unsafe.', 'UNSAFE_OBJECT_KEY');
  }
  if (!key.startsWith(`${GOAT_SOURCE_PREFIX}/source/`)) {
    throw new CharacterSourceError('Metadata key left the CHAR_GOAT_001 source namespace.', 'UNSAFE_OBJECT_KEY');
  }
  if (key !== GOAT_SOURCE_RECEIPT_OBJECT_KEY && !key.startsWith(`${GOAT_SOURCE_PREFIX}/source/sessions/`)) {
    throw new CharacterSourceError('Metadata key is not a Goat receipt or session object.', 'UNSAFE_OBJECT_KEY');
  }
}

export { validateGoatFilename };
