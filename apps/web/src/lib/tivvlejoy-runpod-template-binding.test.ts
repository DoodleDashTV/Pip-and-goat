import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-template-binding.md'), 'utf8');
const helper = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-template-binding.mjs'), 'utf8');
const payload = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-guarded-pod-payload.mjs'), 'utf8');

describe('TivvleJoy RunPod template binding contract', () => {
  it('binds the current approved template in dry-run only', () => {
    expect(docs).toContain('rc8eyeqhn2');
    expect(docs).toContain('b53fcbf5');
    expect(docs).toContain('TEMPLATE_BOUND');
    expect(docs).toContain('DRY_RUN_ONLY');
    expect(docs).toContain('Do not POST /v1/pods');
    expect(helper).toContain("export const APPROVED_TEMPLATE_ID = TRUSTED_TEMPLATE_ID");
    expect(helper).toContain("export const PAID_GPU_ENABLED = false");
    expect(helper).toContain("export const POD_CREATION_ENABLED = false");
    expect(helper).toContain('buildBoundGuardedPodPayload');
    expect(helper).toContain('buildGuardedWorkerPodPayload');
    expect(helper.includes('createGuardedPod')).toBe(false);
    expect(payload).toContain('buildGuardedWorkerPodPayload');
  });
});
