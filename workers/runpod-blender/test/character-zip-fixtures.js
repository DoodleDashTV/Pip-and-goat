'use strict';

function crc32(bytes) {
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

function u16(value) {
  return Buffer.from([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value) {
  return Buffer.from([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function buildStoreZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
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
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, eocd]);
}

function validGoatLikeZip() {
  return buildStoreZip([
    { name: 'Goat_FINN.blend', data: 'BLENDER-TEST-FIXTURE' },
    { name: 'Goat_FINN.fbx', data: 'FBX-TEST-FIXTURE' },
  ]);
}

function traversalZip() {
  return buildStoreZip([
    { name: '../Goat_FINN.blend', data: 'x' },
    { name: 'Goat_FINN.fbx', data: 'y' },
  ]);
}

function prohibitedZip() {
  return buildStoreZip([
    { name: 'Goat_FINN.blend', data: 'x' },
    { name: 'Goat_FINN.fbx', data: 'y' },
    { name: 'payload.exe', data: 'z' },
  ]);
}

function missingBlendZip() {
  return buildStoreZip([{ name: 'Goat_FINN.fbx', data: 'y' }]);
}

function duplicateZip() {
  return buildStoreZip([
    { name: 'Goat_FINN.blend', data: 'a' },
    { name: 'Goat_FINN.blend', data: 'b' },
    { name: 'Goat_FINN.fbx', data: 'c' },
  ]);
}

module.exports = {
  buildStoreZip,
  validGoatLikeZip,
  traversalZip,
  prohibitedZip,
  missingBlendZip,
  duplicateZip,
};
