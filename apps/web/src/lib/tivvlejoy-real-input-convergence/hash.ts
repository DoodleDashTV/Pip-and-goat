import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { sha256Canonical } from '@/lib/tivvlejoy-real-scenery-inspection/hash';

export { sha256Canonical };

export function isValidSha256(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value));
}

export function sha256Bytes(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function stableId(parts: Array<string | number | null | undefined>): string {
  return sha256Canonical(parts.map((part) => (part == null ? '' : String(part)))).slice(0, 32);
}

export async function sha256Stream(source: AsyncIterable<Uint8Array> | NodeJS.ReadableStream | Uint8Array): Promise<string> {
  const hash = createHash('sha256');
  if (source instanceof Uint8Array) {
    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < source.byteLength; offset += chunkSize) {
      hash.update(source.subarray(offset, Math.min(offset + chunkSize, source.byteLength)));
    }
    return hash.digest('hex');
  }
  const readable = Readable.from(source as AsyncIterable<Uint8Array>);
  for await (const chunk of readable) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

export async function sha256FileStream(path: string): Promise<string> {
  return sha256Stream(createReadStream(path));
}

export function* generateLargeFixtureChunks(totalBytes: number, seed = 7): Generator<Uint8Array> {
  const chunkSize = 64 * 1024;
  let remaining = totalBytes;
  let cursor = seed;
  while (remaining > 0) {
    const size = Math.min(chunkSize, remaining);
    const chunk = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      cursor = (cursor * 1103515245 + 12345) >>> 0;
      chunk[i] = cursor & 0xff;
    }
    remaining -= size;
    yield chunk;
  }
}
