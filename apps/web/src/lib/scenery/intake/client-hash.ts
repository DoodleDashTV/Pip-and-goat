'use client';

import { SCENERY_INTAKE_LIMITS } from './limits';
import { CLIENT_SHA256_WORKER_SOURCE, StreamingSha256 } from './sha256-stream';

export async function hashFileChunked(
  file: File,
  onProgress?: (offset: number, total: number) => void,
): Promise<{ sha256: string; byteSize: number }> {
  const chunkBytes = SCENERY_INTAKE_LIMITS.hashChunkBytes;
  if (typeof Worker !== 'undefined') {
    try {
      return await hashWithWorker(file, chunkBytes, onProgress);
    } catch {
      /* fall through to main-thread chunked hash */
    }
  }
  const hash = new StreamingSha256();
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(file.size, offset + chunkBytes);
    const buffer = await file.slice(offset, end).arrayBuffer();
    hash.update(new Uint8Array(buffer));
    offset = end;
    onProgress?.(offset, file.size);
  }
  return { sha256: hash.digestHex(), byteSize: file.size };
}

function hashWithWorker(
  file: File,
  chunkBytes: number,
  onProgress?: (offset: number, total: number) => void,
): Promise<{ sha256: string; byteSize: number }> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([CLIENT_SHA256_WORKER_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.onmessage = (event: MessageEvent<{ type: string; offset?: number; total?: number; sha256?: string; byteSize?: number }>) => {
      if (event.data.type === 'progress' && event.data.offset && event.data.total) {
        onProgress?.(event.data.offset, event.data.total);
        return;
      }
      if (event.data.type === 'done' && event.data.sha256 && event.data.byteSize) {
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve({ sha256: event.data.sha256, byteSize: event.data.byteSize });
      }
    };
    worker.onerror = (error) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(error);
    };
    worker.postMessage({ file, chunkBytes });
  });
}
