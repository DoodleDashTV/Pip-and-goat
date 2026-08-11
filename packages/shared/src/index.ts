export {
  AppError,
  assertNever,
  assertSafePath,
  safeShellArg,
  type SafePathOptions,
} from './errors';

export {
  DURABLE_STORAGE_PREFIXES,
  InMemoryObjectStorage,
  LocalFilesystemStorage,
  MissingObjectStorage,
  S3CompatibleObjectStorage,
  createDefaultObjectStorage,
  createObjectStorageFromConfig,
  describeObjectStorageStatus,
  migrateLocalUriToStorage,
  normalizeStorageCategory,
  parseLocalStorageKey,
  parseStorageKeyFromUri,
  resolveObjectStorageConfig,
  runObjectStorageSelfTest,
  sha256Hex,
  storageKeyFor,
  type LocalMigrationResult,
  type ObjectStorage,
  type ObjectStorageConfig,
  type ObjectStorageStatus,
  type StorageCategory,
  type StorageSelfTestResult,
} from './object-storage';

import { AppError, assertSafePath } from './errors';

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
