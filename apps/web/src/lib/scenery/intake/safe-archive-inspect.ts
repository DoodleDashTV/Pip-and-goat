import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { rejectArchiveEntry, type QuarantineFinding } from './quarantine';
import { fileExtension } from './keys';

export const ARCHIVE_INSPECTION_LIMITS = {
  maxEntries: 20_000,
  maxUncompressedBytes: 8 * 1024 * 1024 * 1024,
  maxEntryUncompressedBytes: 2 * 1024 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxRatioUncompressedBytes: 50 * 1024 * 1024,
  maxCentralDirectoryBytes: 32 * 1024 * 1024,
  maxEocdSearchBytes: 65_557,
  maxHashableEntryBytes: 1 * 1024 * 1024,
  maxDirectorySamples: 200,
} as const;

export type ByteSource = {
  byteLength: number;
  read(offset: number, length: number): Promise<Uint8Array>;
};

export type SafeArchiveEntry = {
  path: string;
  directory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  extension: string;
  encrypted: boolean;
  symlink: boolean;
  method: number;
  localHeaderOffset: number;
};

export type SafeArchiveInspection = {
  archiveType: 'zip' | 'gzip' | 'unitypackage.gz' | 'unknown';
  fileCount: number;
  totalUncompressedSize: number | null;
  directoryStructure: string[];
  containedExtensions: string[];
  modelFiles: string[];
  textures: string[];
  materials: string[];
  hdriOrSkyImages: string[];
  unityPackages: string[];
  blenderFiles: string[];
  fbxFiles: string[];
  glbFiles: string[];
  objFiles: string[];
  mtlFiles: string[];
  documentationAndLicenseFiles: string[];
  suspiciousOrUnsupported: string[];
  duplicateInternalFilenames: string[];
  exactDuplicateInternalContent: Array<{ sha256: string; paths: string[] }>;
  nestedArchives: string[];
  findings: QuarantineFinding[];
  refused: boolean;
  notes: string[];
  executedEmbeddedScripts: false;
  extractedIntoRepository: false;
};

const TEXTURE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.tga',
  '.tif',
  '.tiff',
  '.exr',
  '.bmp',
  '.webp',
]);
const HDRI_EXTENSIONS = new Set(['.hdr', '.exr']);
const DOC_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.rtf']);
const LICENSE_NAMES = /license|licence|readme|eula|copyright/i;
const MATERIAL_EXTENSIONS = new Set(['.mtl', '.mat']);
const HASHABLE_DOC_EXTENSIONS = new Set(['.txt', '.md', '.mtl']);

export function memoryByteSource(bytes: Uint8Array): ByteSource {
  return {
    byteLength: bytes.byteLength,
    async read(offset, length) {
      if (offset < 0 || length < 0 || offset + length > bytes.byteLength) {
        throw new Error('Byte-source read is out of range.');
      }
      return bytes.subarray(offset, offset + length);
    },
  };
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function decodeName(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function findEocd(tail: Uint8Array): number {
  for (let i = tail.byteLength - 22; i >= 0; i -= 1) {
    if (readU32(tail, i) === 0x06054b50) return i;
  }
  throw new Error('ZIP end-of-central-directory signature was not found.');
}

export async function listZipEntriesStreaming(source: ByteSource): Promise<SafeArchiveEntry[]> {
  if (source.byteLength < 22) {
    throw new Error('ZIP is too small to contain a central directory.');
  }
  const search = Math.min(ARCHIVE_INSPECTION_LIMITS.maxEocdSearchBytes, source.byteLength);
  const tail = await source.read(source.byteLength - search, search);
  const eocd = findEocd(tail);
  const commentLength = readU16(tail, eocd + 20);
  if (eocd + 22 + commentLength > tail.byteLength) {
    throw new Error('ZIP comment length is inconsistent with the end-of-central-directory record.');
  }
  const count = readU16(tail, eocd + 10);
  const centralSize = readU32(tail, eocd + 12);
  const centralOffset = readU32(tail, eocd + 16);
  if (count > ARCHIVE_INSPECTION_LIMITS.maxEntries) {
    throw new Error(`ZIP entry count ${count} exceeds the inspection limit.`);
  }
  if (centralSize > ARCHIVE_INSPECTION_LIMITS.maxCentralDirectoryBytes) {
    throw new Error('ZIP central directory exceeds the inspection size limit.');
  }
  if (centralOffset + centralSize > source.byteLength) {
    throw new Error('ZIP central directory is outside the stored object.');
  }
  const central = await source.read(centralOffset, centralSize);
  const entries: SafeArchiveEntry[] = [];
  let offset = 0;
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > central.byteLength || readU32(central, offset) !== 0x02014b50) {
      throw new Error('ZIP central-directory signature mismatch.');
    }
    const flags = readU16(central, offset + 8);
    const method = readU16(central, offset + 10);
    const compressedSize = readU32(central, offset + 20);
    const uncompressedSize = readU32(central, offset + 24);
    const nameLength = readU16(central, offset + 28);
    const extraLength = readU16(central, offset + 30);
    const commentLengthInner = readU16(central, offset + 32);
    const externalAttrs = readU32(central, offset + 38);
    const localHeaderOffset = readU32(central, offset + 42);
    const path = decodeName(central.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({
      path,
      directory: path.endsWith('/'),
      compressedSize,
      uncompressedSize,
      extension: fileExtension(path),
      encrypted: (flags & 0x0001) === 0x0001,
      symlink: ((externalAttrs >>> 16) & 0o170000) === 0o120000,
      method,
      localHeaderOffset,
    });
    offset += 46 + nameLength + extraLength + commentLengthInner;
  }
  return entries;
}

function emptyInspection(archiveType: SafeArchiveInspection['archiveType']): SafeArchiveInspection {
  return {
    archiveType,
    fileCount: 0,
    totalUncompressedSize: 0,
    directoryStructure: [],
    containedExtensions: [],
    modelFiles: [],
    textures: [],
    materials: [],
    hdriOrSkyImages: [],
    unityPackages: [],
    blenderFiles: [],
    fbxFiles: [],
    glbFiles: [],
    objFiles: [],
    mtlFiles: [],
    documentationAndLicenseFiles: [],
    suspiciousOrUnsupported: [],
    duplicateInternalFilenames: [],
    exactDuplicateInternalContent: [],
    nestedArchives: [],
    findings: [],
    refused: false,
    notes: [],
    executedEmbeddedScripts: false,
    extractedIntoRepository: false,
  };
}

export function inspectArchiveEntries(
  entries: SafeArchiveEntry[],
  archiveType: SafeArchiveInspection['archiveType'],
): SafeArchiveInspection {
  const report = emptyInspection(archiveType);
  const files = entries.filter((entry) => !entry.directory);
  const directories = entries.filter((entry) => entry.directory).map((entry) => entry.path);
  const findings: QuarantineFinding[] = [];
  const suspicious: string[] = [];
  let uncompressed = 0;
  const basenameCounts = new Map<string, string[]>();

  if (entries.length > ARCHIVE_INSPECTION_LIMITS.maxEntries) {
    findings.push({
      code: 'UNREASONABLE_ENTRY_COUNT',
      severity: 'error',
      message: `Archive lists ${entries.length} entries, which exceeds the inspection limit.`,
    });
  }

  for (const entry of entries) {
    const pathFindings = rejectArchiveEntry(entry.path);
    findings.push(...pathFindings);
    if (pathFindings.length) suspicious.push(entry.path);
    if (entry.encrypted) {
      findings.push({
        code: 'ENCRYPTED_ARCHIVE_ENTRY',
        severity: 'error',
        message: `Encrypted archive entry cannot be inspected safely: ${entry.path}`,
      });
      suspicious.push(entry.path);
    }
    if (entry.symlink) {
      findings.push({
        code: 'ARCHIVE_SYMLINK',
        severity: 'error',
        message: `Symlink archive entry is refused: ${entry.path}`,
      });
      suspicious.push(entry.path);
    }
    if (entry.uncompressedSize > ARCHIVE_INSPECTION_LIMITS.maxEntryUncompressedBytes) {
      findings.push({
        code: 'DECOMPRESSED_SIZE_LIMIT',
        severity: 'error',
        message: `Archive entry exceeds the decompressed-size limit: ${entry.path}`,
      });
    }
    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize > ARCHIVE_INSPECTION_LIMITS.maxCompressionRatio &&
      entry.uncompressedSize > ARCHIVE_INSPECTION_LIMITS.maxRatioUncompressedBytes
    ) {
      findings.push({
        code: 'EXTREME_COMPRESSION_RATIO',
        severity: 'error',
        message: `Archive entry has an extreme compression ratio: ${entry.path}`,
      });
    }
    uncompressed += entry.uncompressedSize;
    if (!entry.directory) {
      const base = entry.path.split('/').pop() ?? entry.path;
      const list = basenameCounts.get(base.toLowerCase()) ?? [];
      list.push(entry.path);
      basenameCounts.set(base.toLowerCase(), list);
    }
  }

  if (uncompressed > ARCHIVE_INSPECTION_LIMITS.maxUncompressedBytes) {
    findings.push({
      code: 'DECOMPRESSED_SIZE_LIMIT',
      severity: 'error',
      message: 'Archive total uncompressed size exceeds the inspection limit.',
    });
  }

  const nested = files
    .filter((entry) => ['.zip', '.7z', '.rar', '.gz', '.unitypackage'].includes(entry.extension))
    .map((entry) => entry.path);
  if (nested.length) {
    findings.push({
      code: 'NESTED_ARCHIVE',
      severity: 'warning',
      message: `Archive contains ${nested.length} nested archive(s). They were listed, not extracted or executed.`,
    });
  }

  const refused = findings.some((item) => item.severity === 'error');
  report.fileCount = files.length;
  report.totalUncompressedSize = uncompressed;
  report.directoryStructure = directories.slice(0, ARCHIVE_INSPECTION_LIMITS.maxDirectorySamples);
  report.containedExtensions = [...new Set(files.map((entry) => entry.extension).filter(Boolean))].sort();
  report.modelFiles = files
    .filter((entry) => ['.blend', '.fbx', '.obj', '.glb', '.gltf'].includes(entry.extension))
    .map((entry) => entry.path);
  report.textures = files.filter((entry) => TEXTURE_EXTENSIONS.has(entry.extension)).map((entry) => entry.path);
  report.materials = files.filter((entry) => MATERIAL_EXTENSIONS.has(entry.extension)).map((entry) => entry.path);
  report.hdriOrSkyImages = files
    .filter(
      (entry) =>
        HDRI_EXTENSIONS.has(entry.extension) || /hdri|sky/i.test(entry.path),
    )
    .map((entry) => entry.path);
  report.unityPackages = files
    .filter((entry) => entry.extension === '.unitypackage' || entry.path.toLowerCase().includes('.unitypackage'))
    .map((entry) => entry.path);
  report.blenderFiles = files.filter((entry) => entry.extension === '.blend').map((entry) => entry.path);
  report.fbxFiles = files.filter((entry) => entry.extension === '.fbx').map((entry) => entry.path);
  report.glbFiles = files.filter((entry) => entry.extension === '.glb' || entry.extension === '.gltf').map((entry) => entry.path);
  report.objFiles = files.filter((entry) => entry.extension === '.obj').map((entry) => entry.path);
  report.mtlFiles = files.filter((entry) => entry.extension === '.mtl').map((entry) => entry.path);
  report.documentationAndLicenseFiles = files
    .filter((entry) => DOC_EXTENSIONS.has(entry.extension) || LICENSE_NAMES.test(entry.path))
    .map((entry) => entry.path);
  report.suspiciousOrUnsupported = [...new Set(suspicious)];
  report.duplicateInternalFilenames = [...basenameCounts.values()]
    .filter((paths) => paths.length > 1)
    .map((paths) => paths.join(' == '));
  report.nestedArchives = nested;
  report.findings = findings;
  report.refused = refused;
  report.notes = [
    'Archive contents were listed from metadata without extracting into the repository.',
    'Embedded scripts, installers, and binaries were not executed.',
    refused
      ? 'Inspection refused one or more unsafe entries. Original source objects were not overwritten.'
      : 'No refusing archive-safety finding was raised.',
  ];
  return report;
}

export async function hashSmallSafeZipEntries(
  source: ByteSource,
  entries: SafeArchiveEntry[],
): Promise<Array<{ sha256: string; paths: string[] }>> {
  const hashes = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.directory || entry.encrypted || entry.symlink) continue;
    if (entry.uncompressedSize === 0 || entry.uncompressedSize > ARCHIVE_INSPECTION_LIMITS.maxHashableEntryBytes) {
      continue;
    }
    if (!HASHABLE_DOC_EXTENSIONS.has(entry.extension)) continue;
    if (entry.method !== 0 && entry.method !== 8) continue;
    try {
      const bytes = await readZipLocalFile(source, entry);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const list = hashes.get(digest) ?? [];
      list.push(entry.path);
      hashes.set(digest, list);
    } catch {
      // Skip entries that cannot be read safely. Do not invent hashes.
    }
  }
  return [...hashes.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([sha256, paths]) => ({ sha256, paths }));
}

async function readZipLocalFile(source: ByteSource, entry: SafeArchiveEntry): Promise<Uint8Array> {
  if (entry.uncompressedSize > ARCHIVE_INSPECTION_LIMITS.maxHashableEntryBytes) {
    throw new Error('Entry exceeds the hashable documentation limit.');
  }
  const header = await source.read(entry.localHeaderOffset, 30);
  if (readU32(header, 0) !== 0x04034b50) {
    throw new Error('ZIP local-file header signature mismatch.');
  }
  const nameLength = readU16(header, 26);
  const extraLength = readU16(header, 28);
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
  if (entry.compressedSize > ARCHIVE_INSPECTION_LIMITS.maxHashableEntryBytes) {
    throw new Error('Compressed entry exceeds the hashable documentation limit.');
  }
  const compressed = await source.read(dataOffset, entry.compressedSize);
  if (entry.method === 0) {
    return compressed;
  }
  if (entry.method === 8) {
    return inflateRawSync(compressed, { maxOutputLength: ARCHIVE_INSPECTION_LIMITS.maxHashableEntryBytes });
  }
  throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
}

export async function inspectZipByteSource(source: ByteSource): Promise<SafeArchiveInspection> {
  const entries = await listZipEntriesStreaming(source);
  const report = inspectArchiveEntries(entries, 'zip');
  if (!report.refused) {
    report.exactDuplicateInternalContent = await hashSmallSafeZipEntries(source, entries);
  }
  return report;
}

export function inspectGzipHeader(bytes: Uint8Array): { ok: boolean; reason?: string } {
  if (bytes.byteLength < 10) return { ok: false, reason: 'gzip header is truncated' };
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return { ok: false, reason: 'not a gzip container' };
  if (bytes[2] !== 8) return { ok: false, reason: 'unsupported gzip compression method' };
  const flags = bytes[3] ?? 0;
  if (flags & 0x20) return { ok: false, reason: 'gzip extra field indicates encryption' };
  return { ok: true };
}

export function inspectUnityPackageGzHeader(bytes: Uint8Array): SafeArchiveInspection {
  const report = emptyInspection('unitypackage.gz');
  const header = inspectGzipHeader(bytes);
  if (!header.ok) {
    report.findings.push({
      code: 'CORRUPT_OR_UNSUPPORTED_CONTAINER',
      severity: 'error',
      message: header.reason ?? 'Unity package gzip header is not inspectable.',
    });
    report.refused = true;
    report.notes.push('Original .unitypackage.gz bytes were not overwritten.');
    return report;
  }
  report.unityPackages = ['(container)'];
  report.containedExtensions = ['.unitypackage.gz'];
  report.notes.push(
    'Unity package container header was inspected without importing into Unity or executing package scripts.',
    'This source remains preservation-only for the Blender pipeline.',
  );
  return report;
}
