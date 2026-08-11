import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

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

/** Object storage port — local filesystem in development; S3/R2 later without redesign. */
export type StorageCategory =
  | 'original_uploads'
  | 'approved_assets'
  | 'working_files'
  | 'draft_renders'
  | 'final_renders'
  | 'audio'
  | 'captions'
  | 'thumbnails'
  | 'reports'
  | 'manifests'
  | 'worker_tests';

export interface ObjectStorage {
  putObject(key: string, body: Uint8Array, contentType?: string): Promise<string>;
  getObjectUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
  exists?(key: string): Promise<boolean>;
  readObject?(key: string): Promise<Uint8Array>;
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

/**
 * Local filesystem storage for development. Keys are logical; paths are never stored as the
 * sole identity of a production asset — callers persist storageKey + provider.
 */
export class LocalFilesystemStorage implements ObjectStorage {
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    const safe = assertSafePath(key, { allowRelative: true });
    return join(this.rootDir, safe);
  }

  async putObject(key: string, body: Uint8Array, contentType?: string): Promise<string> {
    const full = this.resolve(key);
    await fs.mkdir(dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    if (contentType) {
      await fs.writeFile(`${full}.contentType`, contentType, 'utf8');
    }
    return `local://${key}`;
  }

  async getObjectUrl(key: string): Promise<string> {
    return `file://${this.resolve(key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      /* missing is fine */
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async readObject(key: string): Promise<Uint8Array> {
    const buf = await fs.readFile(this.resolve(key));
    return new Uint8Array(buf);
  }
}

export function storageKeyFor(
  category: StorageCategory,
  parts: Array<string | number>,
): string {
  const cleaned = parts
    .map((p) => String(p).replace(/[^A-Za-z0-9._@+-]+/g, '_'))
    .filter(Boolean);
  return [category, ...cleaned].join('/');
}

export function createDefaultObjectStorage(): ObjectStorage {
  const mode = process.env.OBJECT_STORAGE_PROVIDER ?? 'local';
  if (mode === 'none' || mode === 'missing') {
    return new MissingObjectStorage();
  }
  const root =
    process.env.OBJECT_STORAGE_ROOT ||
    `${process.cwd()}/.doodle-dash-storage`;
  return new LocalFilesystemStorage(root);
}

export type ObjectStorageStatus = {
  provider: string;
  root: string | null;
  durable: boolean;
  banner: 'OK' | 'DURABLE STORAGE NOT CONFIGURED' | 'STORAGE NOT CONFIGURED';
  message: string;
  requiredConfig: string[];
};

/**
 * Local filesystem storage survives process restarts on the same disk but is NOT
 * durable across Cloud Agent redeploys / ephemeral VMs. Production requires a
 * durable object-storage provider (e.g. S3-compatible).
 */
export function describeObjectStorageStatus(): ObjectStorageStatus {
  const provider = process.env.OBJECT_STORAGE_PROVIDER ?? 'local';
  if (provider === 'none' || provider === 'missing') {
    return {
      provider,
      root: null,
      durable: false,
      banner: 'STORAGE NOT CONFIGURED',
      message:
        'Object storage is disabled. Uploads cannot persist binaries until a storage provider is configured.',
      requiredConfig: [
        'Set OBJECT_STORAGE_PROVIDER to a durable provider (recommended: s3).',
        'Set OBJECT_STORAGE_BUCKET (or equivalent) and credentials for that provider.',
        'Alternatively for local-only development: OBJECT_STORAGE_PROVIDER=local and OBJECT_STORAGE_ROOT=/absolute/persistent/path',
      ],
    };
  }
  if (provider === 'local') {
    const root =
      process.env.OBJECT_STORAGE_ROOT || `${process.cwd()}/.doodle-dash-storage`;
    return {
      provider: 'local',
      root,
      durable: false,
      banner: 'DURABLE STORAGE NOT CONFIGURED',
      message:
        'Uploads use local filesystem storage. Binaries survive app restarts on this same machine/path, but are NOT production-safe across Cloud Agent redeploys or ephemeral disks.',
      requiredConfig: [
        'For production durability set OBJECT_STORAGE_PROVIDER=s3 (S3-compatible).',
        'Also set OBJECT_STORAGE_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION (or provider-equivalent vars).',
        'Until then, treat JPEG/model uploads on this agent as temporary and re-upload after redeploy if needed.',
      ],
    };
  }
  return {
    provider,
    root: process.env.OBJECT_STORAGE_ROOT ?? null,
    durable: true,
    banner: 'OK',
    message: `Using configured durable provider "${provider}".`,
    requiredConfig: [],
  };
}

export function parseLocalStorageKey(uri: string): string | null {
  if (uri.startsWith('local://')) return uri.slice('local://'.length);
  return null;
}

const UNSAFE_SHELL_CHARS = /[\0\r\n]/;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._/@:+,=\- ]+$/;

export type SafePathOptions = {
  allowRelative?: boolean;
  allowDashPrefix?: boolean;
};

export function assertSafePath(path: string, options: SafePathOptions = {}): string {
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new AppError('Path must be a non-empty string.', 'UNSAFE_PATH', 400);
  }
  if (UNSAFE_SHELL_CHARS.test(path) || !SAFE_PATH_SEGMENT.test(path)) {
    throw new AppError('Path contains unsafe characters.', 'UNSAFE_PATH', 400);
  }
  if (!options.allowDashPrefix && path.startsWith('-')) {
    throw new AppError('Path must not start with a dash.', 'UNSAFE_PATH', 400);
  }
  if (!options.allowRelative && !path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) {
    throw new AppError('Path must be absolute.', 'UNSAFE_PATH', 400);
  }

  const normalized = path.replace(/\\/g, '/');
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new AppError('Path traversal is not allowed.', 'UNSAFE_PATH', 400);
  }

  return path;
}

export function safeShellArg(value: string): string {
  if (UNSAFE_SHELL_CHARS.test(value)) {
    throw new AppError('Shell argument contains unsafe control characters.', 'UNSAFE_SHELL_ARG', 400);
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export type FfmpegCommand = {
  executable: 'ffmpeg';
  argv: string[];
};

export type FfmpegVideoCodec = 'libx264' | 'libx265';

export class FfmpegPipeline {
  constructor(private readonly executable: 'ffmpeg' = 'ffmpeg') {}

  concat(inputListPath: string, outputPath: string): FfmpegCommand {
    return this.command([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      assertSafePath(inputListPath),
      '-c',
      'copy',
      assertSafePath(outputPath),
    ]);
  }

  mix(inputs: string[], outputPath: string, options: { normalize?: boolean } = {}): FfmpegCommand {
    if (inputs.length === 0) {
      throw new AppError('At least one audio input is required.', 'FFMPEG_NO_INPUTS', 400);
    }
    const argv = inputs.flatMap((input) => ['-i', assertSafePath(input)]);
    const inputLabels = inputs.map((_, index) => `[${index}:a]`).join('');
    argv.push(
      '-filter_complex',
      `${inputLabels}amix=inputs=${inputs.length}:duration=longest${options.normalize ? ':normalize=1' : ''}[aout]`,
      '-map',
      '[aout]',
      assertSafePath(outputPath),
    );
    return this.command(argv);
  }

  burnCaptions(inputPath: string, captionsPath: string, outputPath: string): FfmpegCommand {
    const captionFilterPath = this.escapeFilterPath(assertSafePath(captionsPath));
    return this.command([
      '-i',
      assertSafePath(inputPath),
      '-vf',
      `subtitles='${captionFilterPath}'`,
      '-c:a',
      'copy',
      assertSafePath(outputPath),
    ]);
  }

  thumbnail(inputPath: string, outputPath: string, atSeconds = 0): FfmpegCommand {
    if (!Number.isFinite(atSeconds) || atSeconds < 0) {
      throw new AppError('Thumbnail timestamp must be a positive number.', 'FFMPEG_INVALID_TIME', 400);
    }
    return this.command([
      '-ss',
      String(atSeconds),
      '-i',
      assertSafePath(inputPath),
      '-frames:v',
      '1',
      assertSafePath(outputPath),
    ]);
  }

  encode1080x1920(
    inputPath: string,
    outputPath: string,
    options: { fps?: 24 | 30 | 60; crf?: number; codec?: FfmpegVideoCodec } = {},
  ): FfmpegCommand {
    const fps = options.fps ?? 30;
    const crf = options.crf ?? 18;
    if (![24, 30, 60].includes(fps)) {
      throw new AppError('FPS must be 24, 30, or 60.', 'FFMPEG_INVALID_FPS', 400);
    }
    if (!Number.isInteger(crf) || crf < 0 || crf > 51) {
      throw new AppError('CRF must be an integer between 0 and 51.', 'FFMPEG_INVALID_CRF', 400);
    }
    return this.command([
      '-i',
      assertSafePath(inputPath),
      '-vf',
      `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=${fps}`,
      '-c:v',
      options.codec ?? 'libx264',
      '-crf',
      String(crf),
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      assertSafePath(outputPath),
    ]);
  }

  private command(argv: string[]): FfmpegCommand {
    return { executable: this.executable, argv };
  }

  private escapeFilterPath(path: string): string {
    return path.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
  }
}
