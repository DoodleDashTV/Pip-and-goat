import { SceneryError } from '../types';
import { SCENERY_ALLOWED_EXTENSIONS, SCENERY_PROHIBITED_EXTENSIONS } from './limits';
import { SCENERY_COLLECTION_IDS, type SceneryCollectionId } from './inventory';

const UNSAFE_FILENAME = /[^A-Za-z0-9._@+ -]+/g;

export function fileExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const lower = base.toLowerCase();
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
    throw new SceneryError(`Unsupported executable or script extension: ${ext}`, 'PROHIBITED_EXTENSION');
  }
  if (!(SCENERY_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new SceneryError(`Unsupported scenery file extension: ${ext || '(none)'}`, 'UNSUPPORTED_EXTENSION');
  }
  return ext;
}

export function assertSafeRelativeArchivePath(entryPath: string): void {
  const raw = String(entryPath ?? '');
  if (!raw || raw.includes('\0')) {
    throw new SceneryError('Archive entry path is empty or contains a null byte.', 'ARCHIVE_PATH_TRAVERSAL');
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
  const versioned = input.version && input.version > 1 ? `${stem}.v${input.version}${ext}` : filename;
  const parts = [prefix, input.kind, input.collection, versioned].filter(Boolean) as string[];
  const key = parts.join('/');
  if (key.includes('..') || key.startsWith('/') || key.includes('\\') || key.includes('\0')) {
    throw new SceneryError('Constructed object key is unsafe.', 'UNSAFE_OBJECT_KEY');
  }
  return key;
}

export function assertObjectKeyWithinPrefix(key: string, prefix: string, kind?: string): void {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
  if (!key.startsWith(`${normalizedPrefix}/`)) {
    throw new SceneryError('Object key is outside the private TivvleJoy scenery prefix.', 'UNSAFE_OBJECT_KEY');
  }
  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new SceneryError('Object key is unsafe.', 'UNSAFE_OBJECT_KEY');
  }
  if (kind && !key.startsWith(`${normalizedPrefix}/${kind}/`)) {
    throw new SceneryError(`Object key is outside the ${kind}/ prefix.`, 'UNSAFE_OBJECT_KEY');
  }
}

export function planMultipartParts(byteSize: number, partBytes: number): Array<{ partNumber: number; start: number; end: number }> {
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
