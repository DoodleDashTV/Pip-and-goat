import { createHash } from 'node:crypto';
import type { MultipartStoragePort } from '@/lib/scenery/intake/multipart';

export const EP001_RIG_HASH_CHUNK_BYTES = 16 * 1024 * 1024;

export async function sha256StoredObjectByRange(input: {
  storage: MultipartStoragePort;
  key: string;
  byteSize: number;
  chunkBytes?: number;
}) {
  if (!input.storage.getObjectRange) throw new Error('RIG_RANGE_READ_UNAVAILABLE');
  const chunkBytes = input.chunkBytes ?? EP001_RIG_HASH_CHUNK_BYTES;
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0) throw new Error('RIG_HASH_BYTE_SIZE_INVALID');
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) throw new Error('RIG_HASH_CHUNK_SIZE_INVALID');

  const hash = createHash('sha256');
  let offset = 0;
  let chunksRead = 0;
  while (offset < input.byteSize) {
    const length = Math.min(chunkBytes, input.byteSize - offset);
    const bytes = await input.storage.getObjectRange(input.key, offset, length);
    if (!bytes || bytes.byteLength !== length) throw new Error('RIG_RANGE_READ_INCOMPLETE');
    hash.update(bytes);
    offset += bytes.byteLength;
    chunksRead += 1;
  }
  return { sha256: hash.digest('hex'), bytesRead: offset, chunksRead, chunkBytes };
}
