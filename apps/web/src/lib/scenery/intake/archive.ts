import { rejectArchiveEntry, type QuarantineFinding } from './quarantine';
import { fileExtension } from './keys';

export type ArchiveEntry = {
  path: string;
  directory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  extension: string;
};

export type ArchiveInventoryReport = {
  schemaVersion: 'TIVVLEJOY_SCENERY_ASSET_INTAKE_V1';
  kind: 'archive_inventory';
  executedAgainstStoredBytes: boolean;
  fileCount: number;
  directories: string[];
  extensions: string[];
  compressedSize: number;
  uncompressedSize: number;
  blenderFiles: string[];
  fbxFiles: string[];
  objFiles: string[];
  mtlFiles: string[];
  textureFiles: string[];
  hdrFiles: string[];
  jpgFiles: string[];
  unityPackages: string[];
  psdFiles: string[];
  suspiciousPaths: string[];
  likelyDependencies: string[];
  nestedArchives: string[];
  findings: QuarantineFinding[];
  notes: string[];
};

const TEXTURE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.tga', '.tif', '.tiff', '.exr', '.bmp', '.webp']);

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return Array.from(bytes.subarray(start, start + length), (value) => String.fromCharCode(value)).join('');
}

function readU32(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24);
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function findEocd(bytes: Uint8Array): number {
  for (let i = bytes.byteLength - 22; i >= 0; i -= 1) {
    if (readU32(bytes, i) === 0x06054b50) return i;
  }
  throw new Error('ZIP end-of-central-directory signature was not found.');
}

export function listZipEntriesWithoutExtracting(bytes: Uint8Array): ArchiveEntry[] {
  const eocd = findEocd(bytes);
  const count = readU16(bytes, eocd + 10);
  let offset = readU32(bytes, eocd + 16);
  const entries: ArchiveEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) {
      throw new Error('ZIP central-directory signature mismatch.');
    }
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const path = readAscii(bytes, offset + 46, nameLength);
    entries.push({
      path,
      directory: path.endsWith('/'),
      compressedSize,
      uncompressedSize,
      extension: fileExtension(path),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function inventoryArchiveEntries(entries: ArchiveEntry[], executedAgainstStoredBytes: boolean): ArchiveInventoryReport {
  const findings: QuarantineFinding[] = [];
  const suspiciousPaths: string[] = [];
  for (const entry of entries) {
    const pathFindings = rejectArchiveEntry(entry.path);
    findings.push(...pathFindings);
    if (pathFindings.length) suspiciousPaths.push(entry.path);
  }
  const files = entries.filter((entry) => !entry.directory);
  if (files.length > 20_000) {
    findings.push({
      code: 'UNREASONABLE_ENTRY_COUNT',
      severity: 'error',
      message: `Archive lists ${files.length} entries, which exceeds the inspection limit.`,
    });
  }
  const uncompressedSize = files.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (uncompressedSize > 8 * 1024 * 1024 * 1024) {
    findings.push({
      code: 'DECOMPRESSED_SIZE_LIMIT',
      severity: 'error',
      message: 'Archive total uncompressed size exceeds the inspection limit.',
    });
  }
  for (const entry of files) {
    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize > 100 &&
      entry.uncompressedSize > 50 * 1024 * 1024
    ) {
      findings.push({
        code: 'EXTREME_COMPRESSION_RATIO',
        severity: 'error',
        message: `Archive entry has an extreme compression ratio: ${entry.path}`,
      });
    }
  }
  const extensions = [...new Set(files.map((entry) => entry.extension).filter(Boolean))].sort();
  const nestedArchives = files.filter((entry) => entry.extension === '.zip' || entry.extension === '.7z' || entry.extension === '.rar').map((entry) => entry.path);
  if (nestedArchives.length) {
    findings.push({
      code: 'NESTED_ARCHIVE',
      severity: 'warning',
      message: `Archive contains ${nestedArchives.length} nested archive(s). They were listed, not extracted or executed.`,
    });
  }
  return {
    schemaVersion: 'TIVVLEJOY_SCENERY_ASSET_INTAKE_V1',
    kind: 'archive_inventory',
    executedAgainstStoredBytes,
    fileCount: files.length,
    directories: entries.filter((entry) => entry.directory).map((entry) => entry.path),
    extensions,
    compressedSize: files.reduce((sum, entry) => sum + entry.compressedSize, 0),
    uncompressedSize: files.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
    blenderFiles: files.filter((entry) => entry.extension === '.blend').map((entry) => entry.path),
    fbxFiles: files.filter((entry) => entry.extension === '.fbx').map((entry) => entry.path),
    objFiles: files.filter((entry) => entry.extension === '.obj').map((entry) => entry.path),
    mtlFiles: files.filter((entry) => entry.extension === '.mtl').map((entry) => entry.path),
    textureFiles: files.filter((entry) => TEXTURE_EXTENSIONS.has(entry.extension)).map((entry) => entry.path),
    hdrFiles: files.filter((entry) => entry.extension === '.hdr' || entry.extension === '.exr').map((entry) => entry.path),
    jpgFiles: files.filter((entry) => entry.extension === '.jpg' || entry.extension === '.jpeg').map((entry) => entry.path),
    unityPackages: files.filter((entry) => entry.extension === '.unitypackage').map((entry) => entry.path),
    psdFiles: files.filter((entry) => entry.extension === '.psd').map((entry) => entry.path),
    suspiciousPaths,
    likelyDependencies: files
      .filter((entry) => TEXTURE_EXTENSIONS.has(entry.extension) || entry.extension === '.mtl' || entry.extension === '.txt')
      .map((entry) => entry.path),
    nestedArchives,
    findings,
    notes: [
      'Archive contents were listed from the central directory without extracting into the repository.',
      'Scripts inside purchased archives are never executed.',
      executedAgainstStoredBytes
        ? 'This report was produced from actual archive bytes.'
        : 'This report is a dry-run fixture. Stored R2 bytes were not read.',
    ],
  };
}

export function inventoryZipBytes(bytes: Uint8Array): ArchiveInventoryReport {
  return inventoryArchiveEntries(listZipEntriesWithoutExtracting(bytes), true);
}

export function createDryRunArchiveInventory(entries: ArchiveEntry[]): ArchiveInventoryReport {
  return inventoryArchiveEntries(entries, false);
}

export function buildMinimalZip(files: Array<{ path: string; content: Uint8Array }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.path);
    const local = new Uint8Array(30 + name.byteLength + file.content.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(26, name.byteLength, true);
    localView.setUint32(18, file.content.byteLength, true);
    localView.setUint32(22, file.content.byteLength, true);
    local.set(name, 30);
    local.set(file.content, 30 + name.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(20, file.content.byteLength, true);
    centralView.setUint32(24, file.content.byteLength, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.byteLength;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  const total = offset + centralSize + eocd.byteLength;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of localParts) {
    out.set(part, cursor);
    cursor += part.byteLength;
  }
  for (const part of centralParts) {
    out.set(part, cursor);
    cursor += part.byteLength;
  }
  out.set(eocd, cursor);
  return out;
}
