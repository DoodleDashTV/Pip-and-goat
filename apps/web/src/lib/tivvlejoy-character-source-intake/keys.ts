import { DEFAULT_SCENERY_ASSET_PREFIX } from '@/lib/scenery/intake/config';
import { assessFilenameSafety } from '@/lib/scenery/intake/filename-safety';
import { GOAT_SOURCE_OBJECT_KEY, GOAT_SOURCE_PREFIX } from './types';
import { GOAT_SOURCE_FILENAME } from './goat-spec';

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
  if (!key.startsWith(`${DEFAULT_SCENERY_ASSET_PREFIX}/characters/`)) {
    throw new CharacterSourceError('Object key left the private TivvleJoy asset prefix.', 'UNSAFE_OBJECT_KEY');
  }
  if (!key.startsWith(`${GOAT_SOURCE_PREFIX}/`)) {
    throw new CharacterSourceError('Object key left the CHAR_GOAT_001 namespace.', 'UNSAFE_OBJECT_KEY');
  }
}

export function validateGoatFilename(filename: string): { ok: true } | { ok: false; code: string; reason: string } {
  const safety = assessFilenameSafety(filename);
  if (!safety.safe) {
    return { ok: false, code: 'UNSAFE_FILENAME', reason: `Filename is unsafe: ${safety.issues.join(', ')}.` };
  }
  if (safety.basename !== GOAT_SOURCE_FILENAME) {
    return {
      ok: false,
      code: 'WRONG_FILENAME',
      reason: `Expected ${GOAT_SOURCE_FILENAME}. Received ${safety.basename}.`,
    };
  }
  return { ok: true };
}
