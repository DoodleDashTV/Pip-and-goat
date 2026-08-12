#!/usr/bin/env node
/**
 * Local QC gates CLI — integration hook for DoodleDash Production.
 *
 * Usage:
 *   pnpm --filter @doodle-dash/qc-gates evaluate -- --evidence path/to/evidence.json
 *   pnpm --filter @doodle-dash/qc-gates evaluate -- --fixture camera-only
 *
 * Exit codes:
 *   0 = READY_FOR_CLOUD_ACCEPTANCE true
 *   2 = READY_FOR_CLOUD_ACCEPTANCE false (fail closed)
 *   1 = usage / parse error
 *
 * Does NOT launch Runpod, write R2 production outputs, or alter paid flags.
 */
import { readFileSync } from 'node:fs';
import {
  assertReadyForCloudAcceptance,
  cameraOnlyStaticCharactersEvidence,
  constantCurveEvidence,
  detachedMapMarkEvidence,
  duplicateLightsEvidence,
  evaluateLocalQcGates,
  fakeRigBindingEvidence,
  rotationMismatchEvidence,
  validProductionEvidence,
} from './index';

function printUsage(): void {
  console.error(`Usage:
  tsx src/cli.ts --evidence <file.json>
  tsx src/cli.ts --fixture <valid|camera-only|constant-curves|rotation-mismatch|duplicate-lights|mapmark|fake-rig>
  tsx src/cli.ts --assert-ready --evidence <file.json>`);
}

function loadFixture(name: string) {
  switch (name) {
    case 'valid':
      return validProductionEvidence();
    case 'camera-only':
      return cameraOnlyStaticCharactersEvidence();
    case 'constant-curves':
      return constantCurveEvidence();
    case 'rotation-mismatch':
      return rotationMismatchEvidence();
    case 'duplicate-lights':
      return duplicateLightsEvidence();
    case 'mapmark':
      return detachedMapMarkEvidence();
    case 'fake-rig':
      return fakeRigBindingEvidence();
    default:
      throw new Error(`unknown fixture: ${name}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    printUsage();
    process.exit(1);
  }

  // Hard safety: never enable paid paths from this CLI.
  process.env.CLOUD_RENDER_ENABLED = 'false';
  process.env.ALLOW_PAID_GPU_LAUNCH = 'false';

  let evidence: unknown;
  const evidenceIdx = args.indexOf('--evidence');
  const fixtureIdx = args.indexOf('--fixture');
  if (evidenceIdx >= 0) {
    const path = args[evidenceIdx + 1];
    if (!path) {
      printUsage();
      process.exit(1);
    }
    evidence = JSON.parse(readFileSync(path, 'utf8'));
  } else if (fixtureIdx >= 0) {
    const name = args[fixtureIdx + 1];
    if (!name) {
      printUsage();
      process.exit(1);
    }
    evidence = loadFixture(name);
  } else {
    printUsage();
    process.exit(1);
  }

  if (args.includes('--assert-ready')) {
    try {
      assertReadyForCloudAcceptance(evidence);
      console.log(JSON.stringify({ READY_FOR_CLOUD_ACCEPTANCE: true }, null, 2));
      process.exit(0);
    } catch (err) {
      console.error(String(err instanceof Error ? err.message : err));
      process.exit(2);
    }
  }

  const report = evaluateLocalQcGates(evidence);
  const compact: Record<string, string> = {};
  for (const [id, result] of Object.entries(report.gates)) {
    compact[id] = `${result.status} — ${result.reason}`;
  }
  console.log(
    JSON.stringify(
      {
        READY_FOR_CLOUD_ACCEPTANCE: report.readyForCloudAcceptance,
        failClosed: report.failClosed,
        gates: compact,
        summary: report.summary,
        defects: report.defects,
      },
      null,
      2,
    ),
  );
  process.exit(report.readyForCloudAcceptance ? 0 : 2);
}

main();
