import { spawnSync } from 'node:child_process';

export const PROHIBITED_GIT_PATTERNS = [
  /\.zip$/i,
  /\.hdr$/i,
  /\.exr$/i,
  /\.tga$/i,
  /\.psd$/i,
  /\.fbx$/i,
  /\.obj$/i,
  /\.mtl$/i,
  /\.unitypackage$/i,
  /AKID[A-Z0-9]{16}/,
  /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/,
  /X-Amz-Signature=/,
];

export const PROHIBITED_BLEND_BYTES = 5 * 1024 * 1024;

export function isProhibitedTrackedPath(path: string, sizeBytes = 0): boolean {
  const lowered = path.toLowerCase();
  if (lowered.endsWith('.blend') && sizeBytes >= PROHIBITED_BLEND_BYTES) return true;
  if (/(^|\/)\.env$|(^|\/)\.env\./.test(path) && !path.endsWith('.example')) return true;
  return PROHIBITED_GIT_PATTERNS.some((pattern) => pattern.test(path));
}

export function scanTrackedAndStagedFiles(cwd = process.cwd()): { ok: boolean; violations: string[] } {
  const tracked = spawnSync('git', ['ls-files'], { cwd, encoding: 'utf8' });
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd, encoding: 'utf8' });
  const names = new Set(
    `${tracked.stdout}\n${staged.stdout}`
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const violations: string[] = [];
  for (const name of names) {
    if (name.startsWith('production-library/')) continue;
    if (isProhibitedTrackedPath(name)) {
      violations.push(name);
    }
  }
  const secretGrep = spawnSync(
    'git',
    [
      'grep',
      '-I',
      '-n',
      '-E',
      'R2_SECRET_ACCESS_KEY=[A-Za-z0-9/+]{12,}|OBJECT_STORAGE_SECRET_ACCESS_KEY=[A-Za-z0-9/+]{12,}|X-Amz-Signature=[A-Za-z0-9]+',
      '--',
      '*.ts',
      '*.tsx',
      '*.md',
      '*.env*',
      '*.json',
    ],
    { cwd, encoding: 'utf8' },
  );
  if (secretGrep.stdout.trim()) {
    for (const line of secretGrep.stdout.trim().split('\n')) {
      if (line.includes('placeholder') || line.includes('.example') || line.includes('=...')) continue;
      if (line.includes('pragma: allowlist')) continue;
      violations.push(line);
    }
  }
  return { ok: violations.length === 0, violations };
}
