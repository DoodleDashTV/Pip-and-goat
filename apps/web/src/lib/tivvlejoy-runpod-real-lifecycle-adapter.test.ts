import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-real-lifecycle-adapter.md'), 'utf8');
const helper = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-real-lifecycle-adapter.mjs'), 'utf8');
const lifecycle = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-lifecycle.mjs'), 'utf8');

describe('TivvleJoy RunPod real lifecycle adapter contract', () => {
  it('is blocked by default and reuses the existing lifecycle controller', () => {
    expect(docs).toContain('REAL_LIFECYCLE_PREFLIGHT_PASS');
    expect(docs).toContain('Do not POST /v1/pods');
    expect(docs).toContain('REAL_BUT_BLOCKED');
    expect(docs).toContain('rc8eyeqhn2');
    expect(helper).toContain("export const PAID_GPU_ENABLED = false");
    expect(helper).toContain("export const POD_CREATION_ENABLED = false");
    expect(helper).toContain('createRealRunPodLifecycleAdapter');
    expect(helper).toContain('createGuardedPod');
    expect(helper).toContain('deleteGuardedPod');
    expect(helper).toContain('recoverPodByExactName');
    expect(helper).toContain('runRenderPlan');
    expect(helper).toContain('PAID_EXECUTION_NOT_AUTHORIZED');
    expect(lifecycle.includes('createGuardedPod')).toBe(false);
    expect(lifecycle).toContain('export async function runPodLifecycle');
  });
});
