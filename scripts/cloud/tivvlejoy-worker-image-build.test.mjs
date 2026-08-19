import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-worker-image-build.yml'), 'utf8');
const buildScript = readFileSync(path.join(repoRoot, 'scripts/cloud/build-worker-image.sh'), 'utf8');
const preflight = readFileSync(path.join(repoRoot, 'scripts/cloud/gha-worker-image-preflight.sh'), 'utf8');
const dockerfile = readFileSync(path.join(repoRoot, 'workers/runpod-blender/Dockerfile'), 'utf8');
const common = readFileSync(path.join(repoRoot, 'scripts/cloud/acceptance-1080p/common.ts'), 'utf8');
const workerSource = readFileSync(path.join(repoRoot, 'workers/runpod-blender/src/worker.js'), 'utf8');

const FORBIDDEN_WORKFLOW = [
  'workflow_dispatch',
  'pull_request:',
  'schedule:',
  'workflow_run:',
  'repository_dispatch:',
  'RUNPOD_API_KEY',
  'RUNPOD_RENDER_TEMPLATE_ID',
  'LAUNCH_TIVVLEJOY_GPU',
  'rest.runpod.io',
  '/v1/pods',
  'api.runpod.io',
  'GHCR_TOKEN',
  'GHCR_USER',
  'contents: write',
  'id-token: write',
  'actions: write',
  'deployments: write',
];

describe('tivvlejoy worker image build workflow', () => {
  it('is a tightly scoped push trigger for the refresh branch only', () => {
    assert.match(
      workflow,
      /^on:\n  push:\n    branches:\n      - cursor\/tivvlejoy-runpod-worker-image-refresh-73f1\n/m,
    );
    for (const forbidden of ['workflow_dispatch', 'pull_request:', 'schedule:', 'workflow_run:', 'repository_dispatch:']) {
      assert.equal(workflow.includes(forbidden), false, forbidden);
    }
  });

  it('refuses any other branch and keeps one in-flight build', () => {
    assert.match(workflow, /cursor\/tivvlejoy-runpod-worker-image-refresh-73f1/);
    assert.match(workflow, /group: tivvlejoy-worker-image-\$\{\{ github\.ref \}\}/);
    assert.match(workflow, /cancel-in-progress: false/);
    assert.match(preflight, /EXPECTED_BRANCH="cursor\/tivvlejoy-runpod-worker-image-refresh-73f1"/);
  });

  it('uses least-privilege permissions and Actions GHCR login', () => {
    assert.match(workflow, /permissions:\n  contents: read\n  packages: write\n/);
    assert.equal(workflow.includes('username: ${{ github.actor }}'), true);
    assert.equal(workflow.includes('password: ${{ secrets.GITHUB_TOKEN }}'), true);
    assert.equal(workflow.includes('registry: ghcr.io'), true);
    assert.equal(workflow.includes('GHCR_TOKEN'), false);
    assert.equal(workflow.includes('GHCR_USER'), false);
  });

  it('reuses the authoritative Dockerfile and build script', () => {
    assert.match(workflow, /workers\/runpod-blender\/Dockerfile/);
    assert.match(workflow, /scripts\/cloud\/build-worker-image\.sh/);
    assert.match(workflow, /scripts\/cloud\/gha-worker-image-preflight\.sh/);
    assert.match(dockerfile, /BLENDER_VERSION=4\.2\.3/);
    assert.match(buildScript, /workers\/runpod-blender\/Dockerfile/);
    assert.match(buildScript, /--platform linux\/amd64/);
    assert.match(buildScript, /DDP_SOURCE_COMMIT/);
    assert.match(buildScript, /DDP_WORKER_BUILD_TIME/);
    assert.match(buildScript, /DDP_RENDER_CODE_SHA256/);
  });

  it('does not publish mutable production tags and defers the pin', () => {
    assert.match(buildScript, /latest\|production\|stable/);
    assert.match(buildScript, /PIN UPDATE DEFERRED/);
    assert.equal(workflow.includes(':latest'), false);
    assert.equal(workflow.includes(':production'), false);
    assert.equal(workflow.includes(':stable'), false);
    assert.equal(buildScript.includes('common.ts'), true);
    assert.equal(buildScript.includes('>> scripts/cloud/acceptance-1080p/common.ts'), false);
  });

  it('contains no RunPod secrets, paid approval, or Pod mutation', () => {
    for (const source of [workflow, preflight]) {
      for (const forbidden of FORBIDDEN_WORKFLOW) {
        assert.equal(source.includes(forbidden), false, forbidden);
      }
    }
    assert.equal(buildScript.includes('RUNPOD_API_KEY'), false);
    assert.equal(buildScript.includes('/v1/pods'), false);
    assert.equal(buildScript.includes('rest.runpod.io'), false);
    assert.match(preflight, /RENDER_CODE_MISMATCH/);
    assert.match(buildScript, /GHCR_PACKAGE_WRITE_REFUSED/);
  });

  it('records paid-smoke attempt #1 digest without rewriting PREVIOUS_WORKER_IMAGE', () => {
    assert.match(common, /PAID_SMOKE_ATTEMPT_1_WORKER_IMAGE/);
    assert.match(common, /d791981a4ed530214dcf96cb76593ad6e849c9e408672df36db102a52cdc1b25/);
    assert.match(common, /b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed/);
    assert.match(common, /WORKER_IMAGE_SOURCE_COMMIT = '1ea2cf58c9cfc015929d0a4ca63446898d59ba79'/);
    assert.match(common, /PAID_SMOKE_ATTEMPT_1_TEMPLATE_ID = 'rc8eyeqhn2'/);
    assert.match(common, /PAID_SMOKE_ATTEMPT_1_POD_ID = '71ttvxy4wbxn46'/);
    assert.match(common, /e80cf523b7cb6d6c3a7c8dedda22e90ca0b8664f65be4c55eb82323083b31c27/);
    assert.equal(workerSource.includes("startupWatchdog.milestone('WORKER_READY')"), false);
    assert.equal(workerSource.includes("startupWatchdog.reached('WORKER_READY')"), true);
  });

  it('verifies worker files, assemble_scene, blender, and architecture before push', () => {
    assert.match(buildScript, /\/opt\/ddp-worker\/src\/worker\.js/);
    assert.match(buildScript, /\/opt\/ddp-worker\/src\/single-shot\.js/);
    assert.match(buildScript, /\/opt\/ddp-worker\/src\/render-core\.js/);
    assert.match(buildScript, /\/opt\/ddp-worker\/src\/child-env\.js/);
    assert.match(buildScript, /assemble_scene\.py/);
    assert.match(buildScript, /linux\/amd64/);
    assert.match(buildScript, /\/usr\/local\/bin\/blender/);
  });
});
