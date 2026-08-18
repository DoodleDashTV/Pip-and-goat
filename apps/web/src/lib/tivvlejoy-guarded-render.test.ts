import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod.yml'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-github-actions.md'), 'utf8');
const helper = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-guarded-render.mjs'), 'utf8');

const AUTOMATIC_TRIGGERS = ['push:', 'pull_request:', 'schedule:', 'workflow_run:', 'repository_dispatch:'];

describe('TivvleJoy guarded RunPod workflow contract', () => {
  it('is workflow_dispatch only', () => {
    expect(workflow.startsWith('name: TivvleJoy RunPod\n\non:\n  workflow_dispatch:')).toBe(true);
    for (const trigger of AUTOMATIC_TRIGGERS) {
      expect(workflow.includes(`\n  ${trigger}`)).toBe(false);
    }
  });

  it('defaults to validate with paid confirmation false and the exact approval phrase', () => {
    expect(workflow).toContain('default: validate');
    expect(workflow).toMatch(/confirm_paid_gpu:[\s\S]*default: false/);
    expect(workflow).toContain('paid_approval_phrase:');
    expect(workflow).toContain('LAUNCH_TIVVLEJOY_GPU');
    expect(workflow).toContain('- render_plan');
    expect(workflow).toContain('- render_launch');
  });

  it('pins RTX 4090 Secure Cloud, one GPU, and the hard caps', () => {
    expect(workflow).toContain('NVIDIA GeForce RTX 4090');
    expect(workflow).toContain('TIVVLEJOY_CLOUD_TYPE: SECURE');
    expect(workflow).toContain("TIVVLEJOY_GPU_COUNT: '1'");
    expect(workflow).toContain("MAX_HOURLY_USD: '0.75'");
    expect(workflow).toContain("MAX_RUNTIME_MINUTES: '20'");
    expect(workflow).toContain("MAX_COMPUTE_USD: '0.25'");
    expect(workflow).toContain('timeout-minutes: 25');
    expect(helper).toContain("export const PINNED_GPU_TYPE_ID = 'NVIDIA GeForce RTX 4090'");
    expect(helper).toContain("export const REQUIRED_APPROVAL_PHRASE = 'LAUNCH_TIVVLEJOY_GPU'");
  });

  it('registers cleanup after create and on success or failure', () => {
    expect(workflow).toContain('trap cleanup_on_exit EXIT');
    expect(workflow).toContain('if: ${{ always() && inputs.mode == \'render_launch\' }}');
    expect(workflow).toContain('tivvlejoy-guarded-render.mjs cleanup');
    expect(workflow).toContain('RUNPOD CLEANUP REQUIRES ATTENTION');
  });

  it('does not print secrets or raw API bodies', () => {
    expect(workflow).toContain('RUNPOD_API_KEY: ${{ secrets.RUNPOD_API_KEY }}');
    expect(workflow).toContain('RUNPOD_RENDER_TEMPLATE_ID: ${{ secrets.RUNPOD_RENDER_TEMPLATE_ID }}');
    expect(workflow.includes('set -x')).toBe(false);
    expect(helper.includes('set -x')).toBe(false);
    expect(workflow.includes('curl -v')).toBe(false);
    expect(helper).not.toContain('JSON.stringify(parsed)');
    expect(helper).not.toContain('console.log(text)');
  });

  it('keeps paid Pod mutation out of validate, connectivity, and render_plan', () => {
    const validateStep = workflow.slice(
      workflow.indexOf('name: Validate configuration'),
      workflow.indexOf('name: Connectivity check'),
    );
    const connectivityStep = workflow.slice(
      workflow.indexOf('name: Connectivity check'),
      workflow.indexOf('name: Checkout repository'),
    );
    const planStep = workflow.slice(workflow.indexOf('name: Render plan'), workflow.indexOf('name: Guarded render launch'));
    expect(validateStep).not.toContain('rest.runpod.io/v1/pods');
    expect(connectivityStep).not.toContain('rest.runpod.io/v1/pods');
    expect(planStep).toContain('render-plan');
    expect(planStep).not.toContain('render-launch');
    expect(docs).toContain('Zero-cost local configuration validation');
    expect(docs).toContain('Authenticated API check, no GPU');
    expect(docs).toContain('Live price and availability preflight, no GPU');
    expect(docs).toContain('Paid GPU-capable mode');
    expect(docs).toContain('hard refusal thresholds');
    expect(docs).toContain('LAUNCH_TIVVLEJOY_GPU');
  });
});
