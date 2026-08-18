import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-pod-lifecycle.md'), 'utf8');
const helper = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-lifecycle.mjs'), 'utf8');

describe('TivvleJoy RunPod pod lifecycle contract', () => {
  it('is simulation-only and reuses the single-shot status contract', () => {
    expect(docs).toContain('LIFECYCLE_PASS');
    expect(docs).toContain('Do not POST /v1/pods');
    expect(docs).toContain('startup-status.json');
    expect(docs).toContain('status.json');
    expect(docs).toContain('rc8eyeqhn2');
    expect(helper).toContain("export const PAID_GPU_ENABLED = false");
    expect(helper).toContain("export const POD_CREATION_ENABLED = false");
    expect(helper).toContain('createSimulatedRunPodAdapter');
    expect(helper).toContain('startup-status.json');
    expect(helper.includes('createGuardedPod')).toBe(false);
  });
});
