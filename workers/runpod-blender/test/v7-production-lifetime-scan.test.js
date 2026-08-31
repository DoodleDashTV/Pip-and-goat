const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '../../..');
const files = [
  'workers/runpod-blender/src/v7-proof-a-boot.js',
  'workers/runpod-blender/src/v7-pid1-bootstrap.sh',
  'workers/runpod-blender/Dockerfile.v7-proof-a-startup',
  'scripts/cloud/v7-proof-a-paid/startup_proof_paid.py',
  'config/cloud/v7-proof-a-startup-image.json',
];

for (const rel of files) {
  const text = readFileSync(path.join(repo, rel), 'utf8');
  assert.doesNotMatch(text, /V7_STARTUP_PROOF_SECONDS/, `${rel} still sets a finite stay-alive`);
  assert.doesNotMatch(text, /PROOF_SECONDS\s*=/, `${rel} still has PROOF_SECONDS`);
}

const boot = readFileSync(path.join(repo, 'workers/runpod-blender/src/v7-proof-a-boot.js'), 'utf8');
assert.match(boot, /runPersistentWorker/);
assert.match(boot, /await new Promise\(\(\) => \{/);
assert.doesNotMatch(boot, /setTimeout\(resolve, PROOF/);
assert.doesNotMatch(boot, /sleep infinity|tail -f/);

const dockerfile = readFileSync(path.join(repo, 'workers/runpod-blender/Dockerfile.v7-proof-a-startup'), 'utf8');
assert.match(dockerfile, /ENTRYPOINT \["\/opt\/ddp-worker\/src\/v7-pid1-bootstrap.sh"\]/);
assert.match(dockerfile, /CMD \["node", "\.\/src\/v7-proof-a-boot\.js"\]/);

console.log('v7-production-lifetime-scan.test PASS');
