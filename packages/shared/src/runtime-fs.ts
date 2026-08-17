/**
 * Writable runtime directories for local studio vs serverless hosts.
 *
 * Vercel/Lambda filesystems are read-only except the OS temp dir. Never
 * append `apps/web` here — `process.cwd()` is already the web app on
 * Vercel when Root Directory is `apps/web`.
 */
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type RuntimeEnv = Partial<Record<string, string | undefined>>;

export function isServerlessRuntime(env: RuntimeEnv = process.env): boolean {
  return Boolean(
    env.VERCEL || env.VERCEL_ENV || env.AWS_LAMBDA_FUNCTION_NAME || env.NOW_REGION,
  );
}

export function resolveWritableRuntimeDir(
  folderName: string,
  options: {
    env?: RuntimeEnv;
    cwd?: string;
    tmpdir?: string;
    explicitRoot?: string;
  } = {},
): string {
  if (options.explicitRoot) {
    return path.resolve(options.explicitRoot);
  }
  const env = options.env ?? process.env;
  const tmpdir = options.tmpdir ?? os.tmpdir();
  const cwd = options.cwd ?? process.cwd();
  if (isServerlessRuntime(env)) {
    return path.join(tmpdir, folderName);
  }
  return path.resolve(cwd, folderName);
}

/** Create `dir` recursively. Returns false instead of throwing. */
export function ensureWritableDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}
