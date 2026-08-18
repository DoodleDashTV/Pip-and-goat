export const SCENERY_PART_UPLOAD_TIMEOUT_MS = 12 * 60 * 1000;

export class SceneryPartTransferError extends Error {
  constructor(
    message: string,
    readonly code: 'cors_or_network' | 'timeout' | 'storage_refused' | 'etag_hidden',
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'SceneryPartTransferError';
  }
}

export type SignedPartUploadResult = { etag: string };

export function uploadSignedPart(
  signedUrl: string,
  body: Blob,
  onProgress: (loaded: number, total: number) => void,
): Promise<SignedPartUploadResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', signedUrl);
    request.timeout = SCENERY_PART_UPLOAD_TIMEOUT_MS;
    request.upload.onprogress = (event) => {
      onProgress(event.loaded, event.lengthComputable ? event.total : body.size);
    };
    request.onerror = () => {
      reject(
        new SceneryPartTransferError(
          'The browser could not reach private storage. This is usually an R2 CORS or network problem; your file is still safe on this device.',
          'cors_or_network',
          true,
        ),
      );
    };
    request.ontimeout = () => {
      reject(
        new SceneryPartTransferError(
          'This upload part timed out. The site will request a fresh signed URL and retry it.',
          'timeout',
          true,
        ),
      );
    };
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(
          new SceneryPartTransferError(
            `Private storage refused this upload part (HTTP ${request.status}).`,
            'storage_refused',
            request.status === 408 || request.status === 429 || request.status >= 500,
          ),
        );
        return;
      }
      const etag = request.getResponseHeader('ETag');
      if (!etag) {
        reject(
          new SceneryPartTransferError(
            'R2 received the part but did not expose its ETag to the browser. The bucket CORS policy must expose the ETag header before multipart uploads can finish.',
            'etag_hidden',
            false,
          ),
        );
        return;
      }
      resolve({ etag });
    };
    request.send(body);
  });
}

export function uploadRetryDelayMs(attempt: number): number {
  return Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 8_000);
}
