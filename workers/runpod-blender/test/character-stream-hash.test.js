'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { streamHashAndWrite } = require('../src/character-stream-hash');

test('streams, counts, and hashes bytes before returning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-hash-'));
  const dest = path.join(dir, 'out.bin');
  const bytes = Buffer.from('synthetic-goat-bytes');
  const result = streamHashAndWrite(bytes, dest, {
    maxBytes: bytes.length,
    expectedSize: bytes.length,
    expectedSha256: createHash('sha256').update(bytes).digest('hex'),
  });
  assert.equal(result.streamed, true);
  assert.equal(result.hashedWhileStreaming, true);
  assert.equal(result.size, bytes.length);
  assert.equal(fs.readFileSync(dest).equals(bytes), true);
});

test('rejects size and hash mismatches without leaving a dest file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-hash-'));
  const dest = path.join(dir, 'out.bin');
  assert.throws(
    () => streamHashAndWrite(Buffer.from('abc'), dest, { maxBytes: 3, expectedSize: 4 }),
    (error) => error.code === 'SIZE_MISMATCH',
  );
  assert.equal(fs.existsSync(dest), false);
  assert.throws(
    () => streamHashAndWrite(Buffer.from('abc'), dest, { maxBytes: 3, expectedSize: 3, expectedSha256: 'aa'.repeat(32) }),
    (error) => error.code === 'SHA256_MISMATCH',
  );
  assert.equal(fs.existsSync(dest), false);
});
