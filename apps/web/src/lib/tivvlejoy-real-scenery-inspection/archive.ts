import { inflateRawSync } from 'node:zlib';
import { ARCHIVE_INSPECTION_SCHEMA, DEFAULT_ARCHIVE_LIMITS, type ArchiveLimits, type ArchiveState } from './types';
import { sha256Bytes } from './hash';

export type ArchiveEntryCategory =
  | 'geometry'
  | 'texture'
  | 'material'
  | 'hdri'
  | 'documentation'
  | 'addon_script'
  | 'executable'
  | 'archive'
  | 'other';

export type SafeArchiveEntry = {
  relativePath: string;
  extension: string;
  compressedSize: number;
  uncompressedSize: number;
  directory: boolean;
  probableAssetCategory: ArchiveEntryCategory;
};

export type NestedArchiveRecord = {
  containerDepth: number;
  childPath: string;
  childArchiveHash: string | null;
  childEntryCount: number | null;
  stoppedReason: string | null;
};

export type SafeArchiveInspection = {
  schemaVersion: typeof ARCHIVE_INSPECTION_SCHEMA;
  state: ArchiveState;
  entries: SafeArchiveEntry[];
  nested: NestedArchiveRecord[];
  pythonOrScriptPaths: string[];
  executablePaths: string[];
  geometryPaths: string[];
  texturePaths: string[];
  materialPaths: string[];
  hdriPaths: string[];
  documentationPaths: string[];
  refused: boolean;
  extracted: false;
  executedEmbeddedScripts: false;
  notes: string[];
};

const GEOMETRY_EXT = new Set(['.blend', '.fbx', '.glb', '.gltf', '.obj']);
const TEXTURE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga', '.tif', '.tiff', '.bmp']);
const HDRI_EXT = new Set(['.hdr', '.exr']);
const MATERIAL_EXT = new Set(['.mtl', '.mat']);
const DOC_EXT = new Set(['.txt', '.md', '.pdf', '.rtf', '.html']);
const SCRIPT_EXT = new Set(['.py', '.pyc', '.pyo', '.osl', '.js', '.sh', '.bat', '.ps1', '.command']);
const EXEC_EXT = new Set(['.exe', '.dll', '.so', '.dylib', '.bin']);
const ARCHIVE_EXT = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.unitypackage', '.paq', '.scatpack']);

function extOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx).toLowerCase() : '';
}

export function categorizeArchivePath(relativePath: string): ArchiveEntryCategory {
  const ext = extOf(relativePath);
  if (GEOMETRY_EXT.has(ext)) return 'geometry';
  if (HDRI_EXT.has(ext)) return 'hdri';
  if (TEXTURE_EXT.has(ext)) return 'texture';
  if (MATERIAL_EXT.has(ext)) return 'material';
  if (DOC_EXT.has(ext) || /license|licence|readme|eula|copyright/i.test(relativePath)) return 'documentation';
  if (SCRIPT_EXT.has(ext) || relativePath.includes('__pycache__')) return 'addon_script';
  if (EXEC_EXT.has(ext)) return 'executable';
  if (ARCHIVE_EXT.has(ext)) return 'archive';
  return 'other';
}

export function normalizeArchivePath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

export function archivePathViolation(raw: string): ArchiveState | null {
  const path = normalizeArchivePath(raw);
  if (!path || path === '.') return null;
  if (path.startsWith('/') || path.startsWith('\\')) return 'ARCHIVE_UNSAFE_PATH';
  if (/^[a-zA-Z]:[\\/]/.test(raw) || path.includes(':')) return 'ARCHIVE_UNSAFE_PATH';
  if (path.split('/').some((part) => part === '..')) return 'ARCHIVE_UNSAFE_PATH';
  if (path.includes('\0') || /[\x00-\x1f]/.test(path)) return 'ARCHIVE_UNSAFE_PATH';
  return null;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function findEocd(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.byteLength - 65_557);
  for (let i = bytes.byteLength - 22; i >= min; i -= 1) {
    if (readU32(bytes, i) === 0x06054b50) return i;
  }
  return -1;
}

function empty(state: ArchiveState, notes: string[]): SafeArchiveInspection {
  return {
    schemaVersion: ARCHIVE_INSPECTION_SCHEMA,
    state,
    entries: [],
    nested: [],
    pythonOrScriptPaths: [],
    executablePaths: [],
    geometryPaths: [],
    texturePaths: [],
    materialPaths: [],
    hdriPaths: [],
    documentationPaths: [],
    refused: state !== 'ARCHIVE_SAFE',
    extracted: false,
    executedEmbeddedScripts: false,
    notes,
  };
}

export function inspectZipArchive(
  bytes: Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
  depth = 0,
): SafeArchiveInspection {
  if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return empty(bytes.byteLength >= 4 && bytes[0] === 0x1f && bytes[1] === 0x8b ? 'ARCHIVE_UNSUPPORTED' : 'ARCHIVE_CORRUPT', [
      'Not a ZIP-like container, or the header is malformed.',
    ]);
  }
  const eocd = findEocd(bytes);
  if (eocd < 0) return empty('ARCHIVE_CORRUPT', ['ZIP end-of-central-directory was not found.']);
  const count = readU16(bytes, eocd + 10);
  const centralSize = readU32(bytes, eocd + 12);
  const centralOffset = readU32(bytes, eocd + 16);
  if (count > limits.maxEntries) {
    return empty('ARCHIVE_TOO_MANY_ENTRIES', [`Entry count ${count} exceeds ${limits.maxEntries}.`]);
  }
  if (centralOffset + centralSize > bytes.byteLength) {
    return empty('ARCHIVE_CORRUPT', ['Central directory is outside the stored bytes.']);
  }

  const entries: SafeArchiveEntry[] = [];
  const normalized = new Map<string, string>();
  let totalUncompressed = 0;
  let offset = centralOffset;
  const notes: string[] = [];

  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > bytes.byteLength || readU32(bytes, offset) !== 0x02014b50) {
      return empty('ARCHIVE_CORRUPT', ['Central-directory signature mismatch.']);
    }
    const flags = readU16(bytes, offset + 8);
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const extAttr = readU32(bytes, offset + 38);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const rawName = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes);
    const relativePath = normalizeArchivePath(rawName);
    const pathState = archivePathViolation(rawName);
    if (pathState) return empty(pathState, [`Unsafe archive path: ${rawName}`]);
    const unixMode = (extAttr >>> 16) & 0xffff;
    const isSymlink = (unixMode & 0o170000) === 0o120000;
    const isHardlinkLike = Boolean(flags & 0x0008) && method === 0 && uncompressedSize === 0 && /link/i.test(rawName);
    if (isSymlink || isHardlinkLike) {
      return empty('ARCHIVE_UNSAFE_PATH', [`Refusing ${isSymlink ? 'symlink' : 'hardlink-like'} entry ${rawName}.`]);
    }
    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      return empty('ARCHIVE_TOO_LARGE', [`Entry ${rawName} exceeds the per-entry uncompressed limit.`]);
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio && uncompressedSize > 8 * 1024 * 1024) {
      return empty('ARCHIVE_BOMB_RISK', [`Extreme compression ratio on ${rawName}.`]);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxUncompressedBytes) {
      return empty('ARCHIVE_TOO_LARGE', ['Declared uncompressed size exceeds the archive budget.']);
    }
    const folded = relativePath.toLowerCase();
    if (normalized.has(folded) && normalized.get(folded) !== relativePath) {
      return empty('ARCHIVE_UNSAFE_PATH', [`Case-collision risk for ${relativePath}.`]);
    }
    if (normalized.has(folded)) {
      return empty('ARCHIVE_UNSAFE_PATH', [`Duplicate normalized path ${relativePath}.`]);
    }
    normalized.set(folded, relativePath);
    const directory = relativePath.endsWith('/');
    entries.push({
      relativePath,
      extension: extOf(relativePath),
      compressedSize,
      uncompressedSize,
      directory,
      probableAssetCategory: directory ? 'other' : categorizeArchivePath(relativePath),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const nested: NestedArchiveRecord[] = [];
  if (depth < limits.maxNestedDepth) {
    for (const entry of entries.filter((item) => item.probableAssetCategory === 'archive')) {
      if (nested.length >= limits.maxNestedArchives) {
        nested.push({
          containerDepth: depth + 1,
          childPath: entry.relativePath,
          childArchiveHash: null,
          childEntryCount: null,
          stoppedReason: 'NESTED_ARCHIVE_LIMIT',
        });
        continue;
      }
      const childBytes = tryExtractZipEntry(bytes, entry.relativePath);
      if (!childBytes) {
        nested.push({
          containerDepth: depth + 1,
          childPath: entry.relativePath,
          childArchiveHash: null,
          childEntryCount: null,
          stoppedReason: 'CHILD_NOT_EXTRACTED',
        });
        continue;
      }
      const child = inspectZipArchive(childBytes, limits, depth + 1);
      nested.push({
        containerDepth: depth + 1,
        childPath: entry.relativePath,
        childArchiveHash: sha256Bytes(childBytes),
        childEntryCount: child.entries.length,
        stoppedReason: child.refused ? child.state : null,
      });
      if (child.state === 'ARCHIVE_UNSAFE_PATH' || child.state === 'ARCHIVE_BOMB_RISK') {
        return empty(child.state, [`Nested archive ${entry.relativePath} is unsafe.`, ...child.notes]);
      }
    }
  } else {
    for (const entry of entries.filter((item) => item.probableAssetCategory === 'archive')) {
      nested.push({
        containerDepth: depth + 1,
        childPath: entry.relativePath,
        childArchiveHash: null,
        childEntryCount: null,
        stoppedReason: 'MAX_RECURSION',
      });
    }
  }

  const files = entries.filter((item) => !item.directory);
  return {
    schemaVersion: ARCHIVE_INSPECTION_SCHEMA,
    state: 'ARCHIVE_SAFE',
    entries,
    nested,
    pythonOrScriptPaths: files.filter((item) => item.probableAssetCategory === 'addon_script').map((item) => item.relativePath),
    executablePaths: files.filter((item) => item.probableAssetCategory === 'executable').map((item) => item.relativePath),
    geometryPaths: files.filter((item) => item.probableAssetCategory === 'geometry').map((item) => item.relativePath),
    texturePaths: files.filter((item) => item.probableAssetCategory === 'texture').map((item) => item.relativePath),
    materialPaths: files.filter((item) => item.probableAssetCategory === 'material').map((item) => item.relativePath),
    hdriPaths: files.filter((item) => item.probableAssetCategory === 'hdri').map((item) => item.relativePath),
    documentationPaths: files.filter((item) => item.probableAssetCategory === 'documentation').map((item) => item.relativePath),
    refused: false,
    extracted: false,
    executedEmbeddedScripts: false,
    notes: notes.concat(
      files.some((item) => item.probableAssetCategory === 'addon_script')
        ? ['Python/script files were inventoried and not executed.']
        : [],
    ),
  };
}

function tryExtractZipEntry(bytes: Uint8Array, wanted: string): Uint8Array | null {
  const eocd = findEocd(bytes);
  if (eocd < 0) return null;
  const count = readU16(bytes, eocd + 10);
  const centralOffset = readU32(bytes, eocd + 16);
  let offset = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > bytes.byteLength) return null;
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const localOffset = readU32(bytes, offset + 42);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (normalizeArchivePath(name) === wanted) {
      if (localOffset + 30 > bytes.byteLength) return null;
      const localName = readU16(bytes, localOffset + 26);
      const localExtra = readU16(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + localName + localExtra;
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) {
        try {
          return inflateRawSync(compressed);
        } catch {
          return null;
        }
      }
      return null;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

export function buildStoredZip(entries: Array<{ name: string; data: Uint8Array | string }>): Uint8Array {
  const files = entries.map((entry) => ({
    name: entry.name,
    data: typeof entry.data === 'string' ? new TextEncoder().encode(entry.data) : entry.data,
  }));
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.byteLength + file.data.byteLength);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
    writeU16(local, 8, 0);
    writeU16(local, 10, 0);
    writeU32(local, 14, crc);
    writeU32(local, 18, file.data.byteLength);
    writeU32(local, 22, file.data.byteLength);
    writeU16(local, 26, name.byteLength);
    local.set(name, 30);
    local.set(file.data, 30 + name.byteLength);
    chunks.push(local);
    const central = new Uint8Array(46 + name.byteLength);
    writeU32(central, 0, 0x02014b50);
    writeU16(central, 4, 20);
    writeU16(central, 6, 20);
    writeU32(central, 16, crc);
    writeU32(central, 20, file.data.byteLength);
    writeU32(central, 24, file.data.byteLength);
    writeU16(central, 28, name.byteLength);
    writeU32(central, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.byteLength;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.byteLength, 0);
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 8, files.length);
  writeU16(eocd, 10, files.length);
  writeU32(eocd, 12, centralSize);
  writeU32(eocd, 16, offset);
  const out = new Uint8Array(offset + centralSize + 22);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  for (const chunk of centrals) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  out.set(eocd, cursor);
  return out;
}

function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function crc32(data: Uint8Array): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (~crc) >>> 0;
}
