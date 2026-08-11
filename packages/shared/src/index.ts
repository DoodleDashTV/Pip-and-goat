export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

/** S3-compatible storage port — implementations arrive in later milestones. */
export interface ObjectStorage {
  putObject(key: string, body: Uint8Array, contentType?: string): Promise<string>;
  getObjectUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

export class MissingObjectStorage implements ObjectStorage {
  async putObject(): Promise<string> {
    throw new AppError(
      'Object storage is not configured. Asset binaries must live in durable object storage.',
      'STORAGE_NOT_CONFIGURED',
      501,
    );
  }

  async getObjectUrl(): Promise<string> {
    throw new AppError('Object storage is not configured.', 'STORAGE_NOT_CONFIGURED', 501);
  }

  async deleteObject(): Promise<void> {
    throw new AppError('Object storage is not configured.', 'STORAGE_NOT_CONFIGURED', 501);
  }
}
