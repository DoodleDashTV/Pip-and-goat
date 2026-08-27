/**
 * Anonymous GHCR inspect of the pinned character-worker image.
 * No pull, no Pod, no secrets printed.
 */
import { inspectGhcrImage } from '../../packages/production/src/cloud/worker-provenance';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pinPath = path.resolve(__dirname, '../../config/cloud/character-worker-image.json');
const pinTsPath = path.resolve(__dirname, '../../config/cloud/character-worker-image.pin.ts');
const pin = JSON.parse(readFileSync(pinPath, 'utf8')) as {
  ref: string | null;
  digest: string | null;
  sourceCommit: string | null;
};
const pinTs = readFileSync(pinTsPath, 'utf8');
const pinnedRef =
  pinTs.match(/ghcr\.io\/[A-Za-z0-9._-]+\/ddp-runpod-blender@sha256:[0-9a-f]{64}/)?.[0] || pin.ref;

async function main(): Promise<number> {
  const ref = process.env.IMAGE_REF || pinnedRef;
  if (!ref) {
    console.log('PIN_MISSING');
    return 1;
  }
  const registry = await inspectGhcrImage(ref);
  const labels = registry.labels || {};
  const report = {
    ok: registry.ok,
    amd64: registry.amd64,
    digest: registry.digest,
    detail: registry.detail,
    sourceCommit: labels['ddp.source.commit'] || labels['org.opencontainers.image.revision'] || null,
    blender: labels['ddp.character.blender'] || null,
    characterMaster: labels['ddp.character.master'] || null,
    jobKind: labels['ddp.character.job.kind'] || null,
    stageCount: labels['ddp.character.stage.count'] || null,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!registry.ok || !registry.amd64) return 1;
  if (pin.digest && registry.digest && registry.digest !== pin.digest) return 2;
  if (labels['ddp.character.master'] !== 'true') return 3;
  if (labels['ddp.character.job.kind'] !== 'CHARACTER_MASTER_BUILD') return 4;
  if (labels['ddp.character.stage.count'] !== '26') return 5;
  if (labels['ddp.character.blender'] !== '4.2.2') return 6;
  if (pin.sourceCommit && report.sourceCommit && report.sourceCommit !== pin.sourceCommit) return 7;
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
