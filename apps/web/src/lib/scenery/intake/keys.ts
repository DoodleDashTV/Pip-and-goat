import { SceneryError } from '../types';
import { SCENERY_ALLOWED_EXTENSIONS, SCENERY_PROHIBITED_EXTENSIONS } from './limits';
import { SCENERY_COLLECTION_IDS, type SceneryCollectionId } from './inventory';

const UNSAFE_FILENAME = /[^A-Za-z0-9._@+ -]+/g;

export function fileExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const lower = base.toLowerCase();
  if (lower.endsWith('.unitypackage.gz')) return '.unitypackage.gz';
  if (lower.endsWith('.blend.zip')) return '.zip';
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot) : '';
}

export function sanitizeFilename(filename: string): string {
  const base = String(filename ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .pop();
  if (!base) {
    throw new SceneryError('Filename is empty after sanitization.', 'UNSAFE_FILENAME');
  }
  if (base.includes('\0') || base.startsWith('.') || base === 'desktop.ini') {
    throw new SceneryError('Filename is not allowed.', 'UNSAFE_FILENAME');
  }
  const cleaned = base.replace(UNSAFE_FILENAME, '_').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new SceneryError('Filename is empty after sanitization.', 'UNSAFE_FILENAME');
  }
  if (cleaned.length > 180) {
    const ext = fileExtension(cleaned);
    return `${cleaned.slice(0, 180 - ext.length)}${ext}`;
  }
  return cleaned;
}

export function assertAllowedExtension(filename: string): string {
  const ext = fileExtension(filename);
  if ((SCENERY_PROHIBITED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new SceneryError(
      `Unsupported executable or script extension: ${ext}`,
      'PROHIBITED_EXTENSION',
    );
  }
  if (!(SCENERY_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new SceneryError(
      `Unsupported scenery file extension: ${ext || '(none)'}`,
      'UNSUPPORTED_EXTENSION',
    );
  }
  return ext;
}

export function assertSafeRelativeArchivePath(entryPath: string): void {
  const raw = String(entryPath ?? '');
  if (!raw || raw.includes('\0')) {
    throw new SceneryError(
      'Archive entry path is empty or contains a null byte.',
      'ARCHIVE_PATH_TRAVERSAL',
    );
  }
  if (raw.startsWith('/') || raw.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(raw)) {
    throw new SceneryError('Archive entry uses an absolute path.', 'ARCHIVE_ABSOLUTE_PATH');
  }
  const parts = raw.replace(/\\/g, '/').split('/');
  if (parts.some((part) => part === '..')) {
    throw new SceneryError('Archive entry attempts path traversal.', 'ARCHIVE_PATH_TRAVERSAL');
  }
}

export function assertCollectionId(value: string): SceneryCollectionId {
  if (!(SCENERY_COLLECTION_IDS as readonly string[]).includes(value)) {
    throw new SceneryError(`Unknown scenery collection: ${value}`, 'UNKNOWN_COLLECTION');
  }
  return value as SceneryCollectionId;
}

export const SCENERY_INTERNAL_FOLDERS = {
  'upload-sessions': { kind: 'quarantine' as const, extensions: ['.json'] },
  'intake-manifests': { kind: 'catalogs' as const, extensions: ['.json'] },
  'preview-tests': { kind: 'quarantine' as const, extensions: ['.txt'] },
} as const;

export type SceneryInternalFolder = keyof typeof SCENERY_INTERNAL_FOLDERS;

export function sceneryObjectKey(input: {
  prefix: string;
  kind:
    | 'source'
    | 'quarantine'
    | 'inspection'
    | 'normalized'
    | 'proxies'
    | 'previews'
    | 'catalogs'
    | 'scenes'
    | 'licenses'
    | 'reports'
    | 'validation';
  collection?: string;
  filename: string;
  version?: number;
}): string {
  const prefix = input.prefix.replace(/^\/+|\/+$/g, '');
  if (!prefix || prefix.includes('..') || prefix.startsWith('/')) {
    throw new SceneryError('Unsafe scenery storage prefix.', 'UNSAFE_OBJECT_KEY');
  }
  if (input.kind === 'source' && !input.collection) {
    throw new SceneryError('Source object keys require a collection.', 'UNSAFE_OBJECT_KEY');
  }
  if (input.collection) {
    assertCollectionId(input.collection);
  }
  const filename = sanitizeFilename(input.filename);
  assertAllowedExtension(filename);
  const ext = fileExtension(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  const versioned =
    input.version && input.version > 1 ? `${stem}.v${input.version}${ext}` : filename;
  const parts = [prefix, input.kind, input.collection, versioned].filter(Boolean) as string[];
  const key = parts.join('/');
  if (key.includes('..') || key.startsWith('/') || key.includes('\\') || key.includes('\0')) {
    throw new SceneryError('Constructed object key is unsafe.', 'UNSAFE_OBJECT_KEY');
  }
  return key;
}

export function sceneryInternalObjectKey(input: {
  prefix: string;
  folder: SceneryInternalFolder;
  filename: string;
}): string {
  const prefix = input.prefix.replace(/^\/+|\/+$/g, '');
  if (!prefix || prefix.includes('..') || prefix.startsWith('/')) {
    throw new SceneryError('Unsafe scenery storage prefix.', 'UNSAFE_OBJECT_KEY');
  }
  const spec = SCENERY_INTERNAL_FOLDERS[input.folder];
  const filename = sanitizeFilename(input.filename);
  const ext = fileExtension(filename);
  if (!(spec.extensions as readonly string[]).includes(ext)) {
    throw new SceneryError(
      `Internal scenery object must use ${spec.extensions.join(' or ')}.`,
      'UNSAFE_OBJECT_KEY',
    );
  }
  const key = `${prefix}/${spec.kind}/${input.folder}/${filename}`;
  if (key.includes('..') || key.startsWith('/') || key.includes('\\') || key.includes('\0')) {
    throw new SceneryError('Constructed object key is unsafe.', 'UNSAFE_OBJECT_KEY');
  }
  return key;
}

export function assertObjectKeyWithinPrefix(key: string, prefix: string, kind?: string): void {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
  if (!key.startsWith(`${normalizedPrefix}/`)) {
    throw new SceneryError(
      'Object key is outside the private TivvleJoy scenery prefix.',
      'UNSAFE_OBJECT_KEY',
    );
  }
  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new SceneryError('Object key is unsafe.', 'UNSAFE_OBJECT_KEY');
  }
  if (kind && !key.startsWith(`${normalizedPrefix}/${kind}/`)) {
    throw new SceneryError(`Object key is outside the ${kind}/ prefix.`, 'UNSAFE_OBJECT_KEY');
  }
}

export function assertChunkBoundaries(
  parts: Array<{ partNumber: number; start: number; end: number }>,
  byteSize: number,
  partBytes: number,
): void {
  const planned = planMultipartParts(byteSize, partBytes);
  if (parts.length !== planned.length) {
    throw new SceneryError(
      'Multipart part count does not match the planned chunk boundaries.',
      'INCONSISTENT_PART_COUNT',
    );
  }
  for (const [index, part] of parts.entries()) {
    const expected = planned[index];
    if (
      !expected ||
      part.partNumber !== expected.partNumber ||
      part.start !== expected.start ||
      part.end !== expected.end
    ) {
      throw new SceneryError(
        'Multipart chunk boundaries do not match the planned part map.',
        'INCONSISTENT_PART_COUNT',
      );
    }
    if (part.end <= part.start || part.start < 0 || part.end > byteSize) {
      throw new SceneryError('Multipart chunk boundary is invalid.', 'INCONSISTENT_PART_COUNT');
    }
  }
}

export function planMultipartParts(
  byteSize: number,
  partBytes: number,
): Array<{ partNumber: number; start: number; end: number }> {
  if (byteSize <= 0) {
    throw new SceneryError('Cannot plan multipart parts for a zero-byte file.', 'ZERO_BYTE_FILE');
  }
  const parts = [];
  let start = 0;
  let partNumber = 1;
  while (start < byteSize) {
    const end = Math.min(byteSize, start + partBytes);
    parts.push({ partNumber, start, end });
    start = end;
    partNumber += 1;
  }
  return parts;
}
