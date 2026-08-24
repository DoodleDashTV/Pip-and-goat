import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-worker-image-build.yml'), 'utf8');
const preflight = readFileSync(path.join(repoRoot, 'scripts/cloud/gha-character-worker-image-preflight.sh'), 'utf8');
const dockerfile = readFileSync(path.join(repoRoot, 'workers/runpod-blender/Dockerfile'), 'utf8');
const master = readFileSync(path.join(repoRoot, 'workers/runpod-blender/src/character-master.js'), 'utf8');

describe('character worker image workflow', () => {
  it('is scoped to the character-worker branch and never talks to RunPod', () => {
    assert.match(workflow, /cursor\/tivvlejoy-goat-character-worker-image-73f1/);
    assert.match(preflight, /EXPECTED_BRANCH="cursor\/tivvlejoy-goat-character-worker-image-73f1"/);
    assert.equal(workflow.includes('workflow_dispatch'), false);
    assert.equal(workflow.includes('api.runpod.io'), false);
    assert.equal(workflow.includes('RUNPOD_API_KEY'), false);
    assert.equal(workflow.includes('contents: write'), false);
    assert.match(workflow, /pnpm db:generate/);
    assert.match(workflow, /pnpm --filter @doodle-dash\/web typecheck/);
  });

  it('pins Blender 4.2.2 and bakes the character-master dispatcher', () => {
    assert.match(dockerfile, /BLENDER_VERSION=4\.2\.2/);
    assert.match(dockerfile, /character-capability\.js/);
    assert.match(dockerfile, /ddp.character.master="true"/);
    assert.match(master, /CHARACTER_MASTER_BUILD/);
    assert.match(master, /FINAL_1080P_CANNOT_IMPERSONATE_CHARACTER/);
  });
});
