/**
 * Print the two fingerprints a worker image build has to agree with.
 *
 * Read-only, free, and safe to run anywhere: it hashes files and nothing else.
 *
 *   pnpm --filter @doodle-dash/web exec tsx scripts/cloud/print-fingerprints.ts
 */
import path from 'node:path';

import {
  computeRenderAssetFingerprint,
  computeRenderCodeFingerprint,
} from '../../packages/production/src/cloud/worker-provenance';

const REPO_ROOT = path.resolve(__dirname, '../..');

const code = computeRenderCodeFingerprint(REPO_ROOT);
const assets = computeRenderAssetFingerprint(REPO_ROOT);

console.log(`RENDER_CODE_SHA256 ${code.fingerprint} files=${code.files.length}`);
console.log(`RENDER_ASSET_SHA256 ${assets.fingerprint} files=${assets.files.length}`);
if (process.argv.includes('--files')) {
  for (const f of code.files) console.log(`  code  ${f.sha256}  ${f.path}`);
  for (const f of assets.files) console.log(`  asset ${f.sha256}  ${f.path}`);
}
