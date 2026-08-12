#!/usr/bin/env tsx
/**
 * Non-billable Runpod auth + GPU catalog test.
 * NEVER creates pods / starts billing.
 */
import { runpodAuthSelfTest } from '../../packages/production/src/cloud/runpod-client';

async function main() {
  const result = await runpodAuthSelfTest();
  console.log('RUNPOD AUTH:', result.ok && result.myselfIdPresent ? 'PASS' : 'FAIL');
  console.log('RUNPOD API ACCESS:', result.gpuTypes.length > 0 ? 'PASS' : 'FAIL');
  console.log('MESSAGE:', result.message);
  console.log('GPU_TYPES_RETURNED:', result.gpuTypes.length);
  console.log(
    'PREFERRED_GPUS:',
    JSON.stringify(
      result.preferred.map((g) => ({
        id: g.id,
        displayName: g.displayName,
        memoryInGb: g.memoryInGb,
        uninterruptablePrice: g.uninterruptablePrice,
      })),
      null,
      2,
    ),
  );
  console.log('GPU CREATED: NO');
  console.log('GPU BILLING STARTED: NO');
  process.exit(result.ok ? 0 : 1);
}

main();
