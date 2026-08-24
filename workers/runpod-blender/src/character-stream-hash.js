'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CHUNK = 65_536;

function fail(code, reason, extra = {}) {
  const error = new Error(reason);
  error.code = code;
  Object.assign(error, extra);
  throw error;
}

function streamHashAndWrite(source, destPath, limits = {}) {
  const maxBytes = Number(limits.maxBytes);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    fail('MAX_BYTES_REQUIRED', 'A strict maximum byte size is required before streaming.');
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const hash = createHash('sha256');
  let size = 0;
  const out = fs.openSync(destPath, 'w');
  try {
    if (Buffer.isBuffer(source)) {
      for (let offset = 0; offset < source.length; offset += CHUNK) {
        const chunk = source.subarray(offset, Math.min(offset + CHUNK, source.length));
        size += chunk.length;
        if (size > maxBytes) {
          fail('SIZE_EXCEEDED', 'Stream exceeded the strict maximum byte size.', { observedSize: size, maxBytes });
        }
        hash.update(chunk);
        fs.writeSync(out, chunk);
      }
    } else {
      const fd = fs.openSync(source, 'r');
      try {
        const buf = Buffer.alloc(CHUNK);
        let read;
        while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
          size += read;
          if (size > maxBytes) {
            fail('SIZE_EXCEEDED', 'Stream exceeded the strict maximum byte size.', { observedSize: size, maxBytes });
          }
          hash.update(buf.subarray(0, read));
          fs.writeSync(out, buf, 0, read);
        }
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch (error) {
    try {
      fs.closeSync(out);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(destPath);
    } catch {
      /* ignore */
    }
    throw error;
  }
  fs.closeSync(out);

  const digest = hash.digest('hex');
  if (limits.expectedSize != null && size !== Number(limits.expectedSize)) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      /* ignore */
    }
    fail('SIZE_MISMATCH', 'Streamed byte count does not match the expected size.', {
      observedSize: size,
      expectedSize: Number(limits.expectedSize),
    });
  }
  if (limits.expectedSha256 && digest !== String(limits.expectedSha256).toLowerCase()) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      /* ignore */
    }
    fail('SHA256_MISMATCH', 'Streamed SHA-256 does not match. Extraction was not attempted.', {
      observedSha256: digest,
      expectedSha256: String(limits.expectedSha256).toLowerCase(),
    });
  }
  return { path: destPath, size, sha256: digest, streamed: true, hashedWhileStreaming: true };
}

async function streamReadableHashAndWrite(readable, destPath, limits = {}) {
  const maxBytes = Number(limits.maxBytes);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    fail('MAX_BYTES_REQUIRED', 'A strict maximum byte size is required before streaming.');
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const hash = createHash('sha256');
  let size = 0;
  const out = fs.createWriteStream(destPath);
  try {
    for await (const chunk of readable) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > maxBytes) {
        fail('SIZE_EXCEEDED', 'Stream exceeded the strict maximum byte size.', { observedSize: size, maxBytes });
      }
      hash.update(buf);
      if (!out.write(buf)) {
        await new Promise((resolve) => out.once('drain', resolve));
      }
    }
    await new Promise((resolve, reject) => {
      out.end(() => resolve());
      out.on('error', reject);
    });
  } catch (error) {
    try {
      out.destroy();
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(destPath);
    } catch {
      /* ignore */
    }
    throw error;
  }
  const digest = hash.digest('hex');
  if (limits.expectedSize != null && size !== Number(limits.expectedSize)) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      /* ignore */
    }
    fail('SIZE_MISMATCH', 'Streamed byte count does not match the expected size.', {
      observedSize: size,
      expectedSize: Number(limits.expectedSize),
    });
  }
  if (limits.expectedSha256 && digest !== String(limits.expectedSha256).toLowerCase()) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      /* ignore */
    }
    fail('SHA256_MISMATCH', 'Streamed SHA-256 does not match. Extraction was not attempted.', {
      observedSha256: digest,
      expectedSha256: String(limits.expectedSha256).toLowerCase(),
    });
  }
  return { path: destPath, size, sha256: digest, streamed: true, hashedWhileStreaming: true };
}

module.exports = { streamHashAndWrite, streamReadableHashAndWrite };
