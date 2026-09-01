/**
 * READ-ONLY RunPod GPU catalog. Creates nothing.
 * Writes candidate rows for a later Proof A still only.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { RunpodClient } from '../../../packages/production/src/cloud/runpod-client';

const OUT = 'artifacts/tivvlejoy-scenery-showcase-30s/hdri-qualify-v4/RUNPOD_READONLY_CANDIDATES.json';

async function main() {
  if (!process.env.RUNPOD_API_KEY) {
    writeFileSync(
      OUT,
      JSON.stringify({ schema: 'TJ_RUNPOD_READONLY_V4', ok: false, reason: 'RUNPOD_KEY_MISSING', created: 0 }, null, 2) +
        '\n',
    );
    return;
  }
  const client = new RunpodClient();
  const auth = await client.verifyAuthAndListGpus();
  const preferred = (auth.preferred || []).filter((g) => (g.memoryInGb ?? 0) >= 24);
  const priced = [];
  for (const g of preferred.slice(0, 6)) {
    try {
      const quote = await client.getSecureOnDemandPrice(g.id);
      priced.push({
        gpu: g.displayName,
        gpuTypeId: g.id,
        vramGb: g.memoryInGb,
        secureCloud: g.secureCloud,
        communityCloud: g.communityCloud,
        secureUsdPerHr: quote.uninterruptablePrice,
        communityBidUsdPerHr: g.minimumBidPrice,
        systemRamNote: 'Host system RAM is not in gpuTypes. Reject any worker with system RAM < 24 GiB at launch time.',
        created: false,
      });
    } catch {
      priced.push({
        gpu: g.displayName,
        gpuTypeId: g.id,
        vramGb: g.memoryInGb,
        secureUsdPerHr: g.uninterruptablePrice,
        created: false,
        quoteError: true,
      });
    }
  }
  mkdirSync('artifacts/tivvlejoy-scenery-showcase-30s/hdri-qualify-v4', { recursive: true });
  const payload = {
    schema: 'TJ_RUNPOD_READONLY_V4',
    ok: auth.ok,
    created: 0,
    paidCreate: 0,
    message: auth.message,
    preferredCount: preferred.length,
    candidates: priced,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ event: 'readonly_gpu_catalog', ok: auth.ok, candidates: priced.length, created: 0 }));
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
