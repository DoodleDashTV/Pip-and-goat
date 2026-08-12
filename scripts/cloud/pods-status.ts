#!/usr/bin/env tsx
/**
 * Read-only Runpod pod inventory. Never creates, stops or terminates anything.
 *
 * Used before a paid launch (assert myself.pods is EMPTY) and after termination
 * (assert no billable GPU remains). Exits non-zero when any pod is present so it
 * can be used as a hard gate in a shell pipeline.
 */
import { RunpodClient } from '../../packages/production/src/cloud/runpod-client';

async function main() {
  const client = new RunpodClient({ env: process.env });
  const pods = await client.listMyPods();
  const billable = pods.filter((p) => p.desiredStatus === 'RUNNING' || (p.costPerHr ?? 0) > 0);
  const report = {
    queriedAt: new Date().toISOString(),
    podCount: pods.length,
    myselfPodsEmpty: pods.length === 0,
    activeBillableGpuCount: billable.length,
    pods: pods.map((p) => ({
      id: p.id,
      name: p.name,
      desiredStatus: p.desiredStatus,
      costPerHr: p.costPerHr,
      gpu: p.gpuDisplayName,
      uptimeInSeconds: p.uptimeInSeconds,
    })),
  };
  console.log(JSON.stringify(report, null, 2));
  if (pods.length > 0) process.exit(3);
}

main().catch((e) => {
  console.error(String((e as Error).message || e).replace(/\brpa_[A-Za-z0-9]+/g, '[REDACTED]'));
  process.exit(1);
});
