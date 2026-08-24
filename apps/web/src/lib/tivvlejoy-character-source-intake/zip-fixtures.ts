function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return Uint8Array.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function buildStoreZip(entries: Array<{ name: string; data: string | Uint8Array }>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const data = typeof entry.data === 'string' ? new TextEncoder().encode(entry.data) : entry.data;
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.byteLength),
      u32(data.byteLength),
      u16(name.byteLength),
      u16(0),
      name,
      data,
    ]);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.byteLength),
      u32(data.byteLength),
      u16(name.byteLength),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.byteLength;
  }
  const centralDir = concat(centrals);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.byteLength),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, centralDir, eocd]);
}

export function validGoatLikeZip() {
  return buildStoreZip([
    { name: 'Goat_FINN.blend', data: 'BLENDER-TEST' },
    { name: 'Goat_FINN.fbx', data: 'FBX-TEST' },
    { name: 'textures/base_color.png', data: 'PNG' },
    { name: 'README.md', data: 'Goat delivery' },
  ]);
}

export function traversalZip() {
  return buildStoreZip([{ name: '../evil.blend', data: 'nope' }]);
}

export function missingBlendZip() {
  return buildStoreZip([
    { name: 'Goat_FINN.fbx', data: 'FBX' },
    { name: 'README.md', data: 'missing blend' },
  ]);
}

export function prohibitedPayloadZip() {
  return buildStoreZip([
    { name: 'Goat_FINN.blend', data: 'BLEND' },
    { name: 'Goat_FINN.fbx', data: 'FBX' },
    { name: 'payload.sh', data: '#!/bin/sh' },
  ]);
}

export function corruptZip() {
  return new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
}
