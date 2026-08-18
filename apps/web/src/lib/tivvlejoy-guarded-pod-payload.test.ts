import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-blender-execution.md'), 'utf8');
const helper = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-guarded-pod-payload.mjs'), 'utf8');
const foundation = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-remote-blender-foundation.mjs'), 'utf8');
const guarded = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-guarded-render.mjs'), 'utf8');

describe('TivvleJoy guarded Pod launch payload contract', () => {
  it('is payload-only and does not enable paid create', () => {
    expect(docs).toContain('GUARDED POD LAUNCH PAYLOAD FOUNDATION');
    expect(docs).toContain('least-privilege worker env');
    expect(docs).toContain('guarded Pod payload');
    expect(docs).toContain('NOT YET ENABLED');
    expect(docs).toContain('PAID GPU EXECUTION');
    expect(docs).toContain('POD CREATION');
    expect(helper).toContain("export const PAID_GPU_ENABLED = false");
    expect(helper).toContain("export const POD_CREATION_ENABLED = false");
    expect(helper).toContain('buildGuardedWorkerPodPayload');
    expect(helper).toContain('buildCreatePodPayload');
    expect(helper).toContain('buildWorkerEnvironment');
    expect(helper).toContain('TEMPLATE_REQUIRED');
    expect(helper).toContain('MAX_WORKER_ENV_KEYS = 50');
    expect(helper.includes('createGuardedPod(')).toBe(false);
  });

  it('keeps foundation free of paid Pod mutation and reuses guarded pins', () => {
    expect(foundation.includes("method: 'POST'")).toBe(false);
    expect(foundation.includes('https://rest.runpod.io/v1/pods')).toBe(false);
    expect(guarded).toContain("export const PINNED_GPU_TYPE_ID = 'NVIDIA GeForce RTX 4090'");
    expect(guarded).toContain("export const PINNED_CLOUD_TYPE = 'SECURE'");
    expect(docs).toContain('pod-payload-dry-run');
  });
});
