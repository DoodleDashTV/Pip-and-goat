import { createHash } from 'node:crypto';
import { SCENERY_INTAKE_LIMITS } from './limits';
import { CLIENT_SHA256_WORKER_SOURCE, streamingSha256Hex } from './sha256-stream';

export { CLIENT_SHA256_WORKER_SOURCE };

export function planHashChunks(byteSize: number, chunkBytes = SCENERY_INTAKE_LIMITS.hashChunkBytes) {
  if (byteSize < 0) {
    throw new Error('Negative byte size cannot be hashed.');
  }
  if (byteSize === 0) {
    return [];
  }
  const chunks = [];
  let start = 0;
  let index = 0;
  while (start < byteSize) {
    const end = Math.min(byteSize, start + chunkBytes);
    chunks.push({ index, start, end });
    start = end;
    index += 1;
  }
  return chunks;
}

export function sha256HexChunked(bytes: Uint8Array, chunkBytes = SCENERY_INTAKE_LIMITS.hashChunkBytes): string {
  const hash = createHash('sha256');
  for (const chunk of planHashChunks(bytes.byteLength, chunkBytes)) {
    hash.update(bytes.subarray(chunk.start, chunk.end));
  }
  return hash.digest('hex');
}

export function sha256HexStreaming(bytes: Uint8Array, chunkBytes = SCENERY_INTAKE_LIMITS.hashChunkBytes): string {
  return streamingSha256Hex(bytes, chunkBytes);
}

export async function sha256HexFromBlobs(
  readChunk: (start: number, end: number) => Promise<Uint8Array>,
  byteSize: number,
  chunkBytes = SCENERY_INTAKE_LIMITS.hashChunkBytes,
): Promise<string> {
  const hash = createHash('sha256');
  for (const chunk of planHashChunks(byteSize, chunkBytes)) {
    hash.update(await readChunk(chunk.start, chunk.end));
  }
  return hash.digest('hex');
}

export function clientHashUsesChunkedReads(): boolean {
  return (
    CLIENT_SHA256_WORKER_SOURCE.includes('file.slice') &&
    CLIENT_SHA256_WORKER_SOURCE.includes('StreamingSha256') &&
    !CLIENT_SHA256_WORKER_SOURCE.includes('new Uint8Array(total)')
  );
}
