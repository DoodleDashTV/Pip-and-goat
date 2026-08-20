import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { COMMERCIAL_EXTENSIONS, SAFETY_DEFAULTS, type SafetyReport } from './types';

export function safetyReport(): SafetyReport {
  return { ...SAFETY_DEFAULTS };
}

const TRACKED_SOURCE_ROOTS = ['apps/', 'packages/', 'docs/', 'scripts/', 'workers/'];

export function isCommercialExtension(filePath: string): boolean {
  const lowered = filePath.toLowerCase();
  return COMMERCIAL_EXTENSIONS.some((ext) => lowered.endsWith(ext));
}

export function isTrackedSourcePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('production-library/')) return false;
  return TRACKED_SOURCE_ROOTS.some((root) => normalized.startsWith(root));
}

export function assertNoCommercialBytesInTrackedSources(paths: readonly string[]): string[] {
  return paths.filter((item) => isTrackedSourcePath(item) && isCommercialExtension(item));
}

export function scanCommittedCommercialBinaries(cwd = process.cwd()): {
  ok: boolean;
  violations: string[];
} {
  const tracked = spawnSync('git', ['ls-files'], { cwd, encoding: 'utf8' });
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd, encoding: 'utf8' });
  const names = `${tracked.stdout ?? ''}\n${staged.stdout ?? ''}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const violations = assertNoCommercialBytesInTrackedSources(names).filter((name) => {
    if (name.includes('/fixtures/') && name.endsWith('.json')) return false;
    return true;
  });
  return { ok: violations.length === 0, violations };
}

export function isUnsafeWorkspacePath(target: string, repoRoot = process.cwd()): boolean {
  const resolved = path.resolve(target);
  const root = path.resolve(repoRoot);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
    const relative = path.relative(root, resolved).replace(/\\/g, '/');
    if (relative.startsWith('production-library')) return true;
    if (!relative.startsWith('..') && relative !== '') return true;
  }
  return false;
}
