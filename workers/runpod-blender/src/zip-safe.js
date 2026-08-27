'use strict';

const { inflateRawSync } = require('node:zlib');

const PROHIBITED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.sh',
  '.ps1',
  '.dll',
  '.so',
  '.dylib',
]);

function readU16(buf, offset) {
  return buf.readUInt16LE(offset);
}

function readU32(buf, offset) {
  return buf.readUInt32LE(offset);
}

function listZipEntries(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length < 22) {
    const err = new Error('ZIP_CORRUPT');
    err.code = 'ZIP_CORRUPT';
    throw err;
  }
  let eocd = -1;
  const searchStart = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= searchStart; i -= 1) {
    if (readU32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    const err = new Error('ZIP_CORRUPT');
    err.code = 'ZIP_CORRUPT';
    throw err;
  }
  const count = readU16(buf, eocd + 10);
  const cdSize = readU32(buf, eocd + 12);
  const cdOffset = readU32(buf, eocd + 16);
  if (cdOffset + cdSize > buf.length) {
    const err = new Error('ZIP_CORRUPT');
    err.code = 'ZIP_CORRUPT';
    throw err;
  }
  const entries = [];
  let cursor = cdOffset;
  for (let i = 0; i < count; i += 1) {
    if (readU32(buf, cursor) !== 0x02014b50) {
      const err = new Error('ZIP_CORRUPT');
      err.code = 'ZIP_CORRUPT';
      throw err;
    }
    const method = readU16(buf, cursor + 10);
    const compressedSize = readU32(buf, cursor + 20);
    const uncompressedSize = readU32(buf, cursor + 24);
    const nameLen = readU16(buf, cursor + 28);
    const extraLen = readU16(buf, cursor + 30);
    const commentLen = readU16(buf, cursor + 32);
    const localOffset = readU32(buf, cursor + 42);
    const name = buf.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    entries.push({
      path: name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      directory: name.endsWith('/'),
    });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function inspectZipSafety(bytes, required = { blend: 'Goat_FINN.blend', fbx: 'Goat_FINN.fbx' }) {
  const entries = listZipEntries(bytes);
  const members = entries.filter((item) => !item.directory).map((item) => item.path);
  const findings = [];
  const seen = new Set();
  for (const entry of entries) {
    const normalized = entry.path.replace(/\\/g, '/');
    if (normalized.includes('..') || normalized.startsWith('/') || normalized.includes('\0')) {
      findings.push('ZIP_TRAVERSAL');
    }
    if (seen.has(normalized)) findings.push('ZIP_DUPLICATE');
    seen.add(normalized);
    const ext = normalized.includes('.') ? `.${normalized.split('.').pop().toLowerCase()}` : '';
    if (PROHIBITED_EXTENSIONS.has(ext)) findings.push('ZIP_PROHIBITED_PAYLOAD');
    if (normalized.endsWith('.lnk') || normalized.endsWith('.symlink')) findings.push('ZIP_LINK');
  }
  const hasBlend = members.some((path) => path.replace(/\\/g, '/').endsWith(required.blend));
  const hasFbx = members.some((path) => path.replace(/\\/g, '/').endsWith(required.fbx));
  if (!hasBlend || !hasFbx) findings.push('MISSING_REQUIRED_FILE');
  const unique = [...new Set(findings)];
  const code = unique.includes('ZIP_TRAVERSAL')
    ? 'ZIP_TRAVERSAL'
    : unique.includes('ZIP_PROHIBITED_PAYLOAD')
      ? 'ZIP_PROHIBITED_PAYLOAD'
      : unique.includes('ZIP_LINK')
        ? 'ZIP_LINK'
        : unique.includes('ZIP_DUPLICATE')
          ? 'ZIP_DUPLICATE'
          : unique.includes('MISSING_REQUIRED_FILE')
            ? 'MISSING_REQUIRED_FILE'
            : 'ZIP_SAFE';
  return {
    ok: code === 'ZIP_SAFE',
    code,
    members,
    count: members.length,
    findings: unique,
  };
}

function extractZipSafely(bytes, destDir, fsImpl) {
  const fs = fsImpl;
  const path = require('node:path');
  const inspected = inspectZipSafety(bytes);
  if (!inspected.ok) {
    const err = new Error(inspected.code);
    err.code = inspected.code;
    throw err;
  }
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const entries = listZipEntries(buf);
  const written = [];
  for (const entry of entries) {
    if (entry.directory) continue;
    const normalized = entry.path.replace(/\\/g, '/');
    const target = path.resolve(destDir, normalized);
    if (!target.startsWith(path.resolve(destDir))) {
      const err = new Error('ZIP_TRAVERSAL');
      err.code = 'ZIP_TRAVERSAL';
      throw err;
    }
    const localOff = entry.localOffset;
    if (readU32(buf, localOff) !== 0x04034b50) {
      const err = new Error('ZIP_CORRUPT');
      err.code = 'ZIP_CORRUPT';
      throw err;
    }
    const nameLen = readU16(buf, localOff + 26);
    const extraLen = readU16(buf, localOff + 28);
    const dataStart = localOff + 30 + nameLen + extraLen;
    const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);
    const data =
      entry.method === 0 ? compressed : entry.method === 8 ? inflateRawSync(compressed) : null;
    if (!data) {
      const err = new Error('ZIP_CORRUPT');
      err.code = 'ZIP_CORRUPT';
      throw err;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    written.push(target);
  }
  return { ...inspected, written };
}

module.exports = { listZipEntries, inspectZipSafety, extractZipSafely, PROHIBITED_EXTENSIONS };
