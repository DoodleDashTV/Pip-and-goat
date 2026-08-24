#!/usr/bin/env tsx
/**
 * TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V3 launch gate.
 *
 * CREATE is not entered while AUTHORIZED_IMAGE_CANNOT_INVOKE_REAL_DOWNLOAD stands.
 * This script never lifts ALLOW_PAID_GPU_LAUNCH or PAID_EXECUTION_AUTHORIZED,
 * never calls createPodForBenchmark, and never consumes V3.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  provePinnedImageCannotInvokeRealDownload,
  readGoatV3ConsumptionLedger,
} from '../../../apps/web/src/lib/tivvlejoy-character-source-intake';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-goat-paid-execution-v3');

function main(): number {
  mkdirSync(OUT_DIR, { recursive: true });
  const preflight = spawnSync(
    'pnpm',
    ['--filter', '@doodle-dash/web', 'exec', 'tsx', '../../scripts/cloud/goat-paid-execution-v3/preflight.ts'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  if (preflight.status !== 0) {
    writeFileSync(
      path.join(OUT_DIR, 'launch.json'),
      `${JSON.stringify(
        {
          schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V3',
          status: 'STOPPED_BEFORE_PAID_CREATE',
          createEntered: false,
          podCreateRequestCount: 0,
          reason: 'Zero-cost preflight failed before CREATE.',
        },
        null,
        2,
      )}\n`,
    );
    return preflight.status || 1;
  }
  const downloadProof = provePinnedImageCannotInvokeRealDownload(REPO_ROOT);
  const ledger = readGoatV3ConsumptionLedger(REPO_ROOT);
  let preflightBlockers: string[] = [];
  try {
    const facts = JSON.parse(readFileSync(path.join(OUT_DIR, 'preflight.json'), 'utf8')) as {
      remainingBlockers?: string[];
    };
    preflightBlockers = facts.remainingBlockers ?? [];
  } catch {
    preflightBlockers = [];
  }
  const launch = {
    schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V3',
    status: 'STOPPED_BEFORE_PAID_CREATE' as const,
    createEntered: false,
    authorizationConsumed: ledger.consumed,
    consumptionPoint: 'UNCONSUMED_PREFLIGHT_BLOCKER',
    podCreateRequestCount: 0,
    confirmedPodCount: 0,
    realGoatDownloadCount: 0,
    allowPaidGpuLaunchLifted: false,
    paidExecutionAuthorizedLifted: false,
    remainingBlockers: [...new Set([...preflightBlockers, downloadProof.code])],
    reason: downloadProof.reason,
  };
  writeFileSync(path.join(OUT_DIR, 'launch.json'), `${JSON.stringify(launch, null, 2)}\n`);
  const preflightPath = path.join(OUT_DIR, 'preflight.json');
  try {
    const facts = JSON.parse(readFileSync(preflightPath, 'utf8')) as { remainingBlockers?: string[] };
    console.log(
      JSON.stringify(
        {
          ...launch,
          preflightBlockers: facts.remainingBlockers ?? [],
        },
        null,
        2,
      ),
    );
  } catch {
    console.log(JSON.stringify(launch, null, 2));
  }
  return 2;
}

process.exit(main());
