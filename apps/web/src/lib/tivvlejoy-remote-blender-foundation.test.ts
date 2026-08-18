import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-blender-execution.md'), 'utf8');
const helper = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-remote-blender-foundation.mjs'), 'utf8');
const guarded = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-guarded-render.mjs'), 'utf8');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod.yml'), 'utf8');

describe('TivvleJoy remote Blender execution foundation contract', () => {
  it('is foundation-only and does not enable paid or remote execution', () => {
    expect(docs).toContain('REMOTE EXECUTION FOUNDATION ONLY');
    expect(docs).toContain('NOT YET ENABLED');
    expect(docs).toContain('PAID GPU EXECUTION');
    expect(docs).toContain('REMOTE BLENDER EXECUTION');
    expect(helper).toContain("export const PAID_GPU_ENABLED = false");
    expect(helper).toContain("export const REMOTE_BLENDER_EXECUTION_ENABLED = false");
    expect(helper).toContain("export const AUTOMATIC_PRODUCTION_RENDERING_ENABLED = false");
  });

  it('reuses the accepted render-core Blender command and 20-minute wrapper', () => {
    expect(helper).toContain('workers/runpod-blender/src/render-core.js');
    expect(helper).toContain('buildBlenderArgv');
    expect(helper).toContain('validateManifest');
    expect(helper).toContain('compileTivvleJoyJobToWorkerManifest');
    expect(helper).toContain('ddp-cloud-job-manifest-v1');
    expect(helper).toContain('scripts/blender/assemble_scene.py');
    expect(helper).toContain('timeout');
    expect(helper).toContain('PILOT_MAX_RUNTIME_MINUTES');
    expect(docs).toContain('1080x1920');
    expect(docs).toContain('blender --background --factory-startup');
    expect(docs).toContain('compileTivvleJoyJobToWorkerManifest()');
    expect(docs).toContain('ddp-cloud-job-manifest-v1');
    expect(docs).toContain('WORKER CONTRACT ALIGNMENT COMPLETE');
    expect(helper).toContain('WORKER_COST_WATCHDOG');
  });

  it('does not add paid Pod mutation and leaves guarded gates intact', () => {
    expect(helper.includes("method: 'POST'")).toBe(false);
    expect(helper.includes('https://rest.runpod.io/v1/pods')).toBe(false);
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow.includes('\n  push:')).toBe(false);
    expect(workflow).toContain('LAUNCH_TIVVLEJOY_GPU');
    expect(guarded).toContain("export const REQUIRED_APPROVAL_PHRASE = 'LAUNCH_TIVVLEJOY_GPU'");
    expect(guarded).toContain("export const PINNED_GPU_TYPE_ID = 'NVIDIA GeForce RTX 4090'");
  });
});
