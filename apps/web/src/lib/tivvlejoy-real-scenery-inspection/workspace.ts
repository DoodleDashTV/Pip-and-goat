import { mkdtempSync, rmSync, chmodSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { isUnsafeWorkspacePath } from './safety';

export type IsolatedWorkspace = {
  root: string;
  sourceDir: string;
  extractDir: string;
  closed: boolean;
  readonly: true;
  insideGitWorkspace: false;
  insideProductionLibrary: false;
};

const PREFIX = 'tivvlejoy-scenery-inspect-';

export function createIsolatedWorkspace(repoRoot = process.cwd()): IsolatedWorkspace {
  const root = mkdtempSync(path.join(tmpdir(), `${PREFIX}${randomBytes(6).toString('hex')}-`));
  if (isUnsafeWorkspacePath(root, repoRoot)) {
    rmSync(root, { recursive: true, force: true });
    throw new Error('Refusing to materialize commercial bytes inside the Git workspace or production-library.');
  }
  const sourceDir = path.join(root, 'source');
  const extractDir = path.join(root, 'extract');
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(extractDir, { recursive: true });
  try {
    chmodSync(root, 0o700);
    chmodSync(sourceDir, 0o700);
    chmodSync(extractDir, 0o700);
  } catch {
    // Permissions are best-effort on filesystems that ignore chmod.
  }
  return {
    root,
    sourceDir,
    extractDir,
    closed: false,
    readonly: true,
    insideGitWorkspace: false,
    insideProductionLibrary: false,
  };
}

export function writeReadOnlySourceCopy(workspace: IsolatedWorkspace, filename: string, bytes: Uint8Array): string {
  const safeName = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '_');
  const dest = path.join(workspace.sourceDir, safeName || 'source.bin');
  writeFileSync(dest, bytes);
  try {
    chmodSync(dest, 0o400);
  } catch {
    // best-effort read-only
  }
  return dest;
}

export function destroyIsolatedWorkspace(workspace: IsolatedWorkspace): void {
  if (workspace.closed) return;
  rmSync(workspace.root, { recursive: true, force: true });
  workspace.closed = true;
}

export function withIsolatedWorkspace<T>(fn: (workspace: IsolatedWorkspace) => T | Promise<T>): Promise<T> {
  const workspace = createIsolatedWorkspace();
  return Promise.resolve()
    .then(() => fn(workspace))
    .finally(() => destroyIsolatedWorkspace(workspace));
}

export function workspaceStillExists(workspace: IsolatedWorkspace): boolean {
  return existsSync(workspace.root);
}
