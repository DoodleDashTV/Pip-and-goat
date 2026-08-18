import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-one-pod-paid-smoke.md'), 'utf8');
const helper = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-one-pod-paid-smoke.mjs'), 'utf8');
const adapter = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-real-lifecycle-adapter.mjs'), 'utf8');

describe('TivvleJoy one-Pod paid smoke contract', () => {
  it('stays fail-closed by default and reuses the lifecycle controller', () => {
    expect(docs).toContain('PAID_SMOKE_PREFLIGHT_PASS');
    expect(docs).toContain('Do not POST /v1/pods unless execute');
    expect(docs).toContain('rc8eyeqhn2');
    expect(helper).toContain("export const PAID_GPU_ENABLED = false");
    expect(helper).toContain("export const POD_CREATION_ENABLED = false");
    expect(helper).toContain('runPodLifecycle');
    expect(helper).toContain('createRealRunPodLifecycleAdapter');
    expect(helper).toContain('STARTUP_WATCHDOG_MS');
    expect(helper.includes('createPodForBenchmark')).toBe(false);
    expect(adapter).toContain('allowRealNetwork');
  });
});
