/**
 * Step 29 — CI/CD quality gates (local and CI-compatible).
 *
 * Detects missing, skipped, or falsely reported checks. Does not deploy,
 * merge, use paid jobs, or expose secrets.
 */
import { createHash } from 'node:crypto';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { stamp } from './labels';

export const REQUIRED_CI_GATES = [
  'tests',
  'typecheck',
  'lint',
  'persist',
  'studio-hardening-17-24',
  'steps-9-16-closed',
  'security-access-policy',
  'audit-chain-integrity',
  'release-verification',
  'backup-restore',
  'vulnerability-policy',
  'spend-controls',
  'golden-scene-regression',
] as const;
export type RequiredCiGate = (typeof REQUIRED_CI_GATES)[number];

export type CiCheck = {
  name: RequiredCiGate | string;
  status: 'PASS' | 'FAIL' | 'SKIPPED' | 'MISSING';
  detail: string;
};

export function evaluateCiGates(reported: readonly CiCheck[]): {
  checks: CiCheck[];
  missing: string[];
  skipped: string[];
  falsePass: string[];
  refused: boolean;
  reason: string;
} {
  const byName = new Map(reported.map((check) => [check.name, check]));
  const checks: CiCheck[] = REQUIRED_CI_GATES.map((name) => {
    const found = byName.get(name);
    if (!found) return { name, status: 'MISSING', detail: 'required check not reported' };
    return found;
  });
  const missing = checks.filter((check) => check.status === 'MISSING').map((check) => String(check.name));
  const skipped = checks.filter((check) => check.status === 'SKIPPED').map((check) => String(check.name));
  const falsePass = reported
    .filter((check) => check.status === 'PASS' && /not run|skipped|todo/i.test(check.detail))
    .map((check) => String(check.name));
  const refused = missing.length > 0 || skipped.length > 0 || falsePass.length > 0 || checks.some((check) => check.status === 'FAIL');
  return {
    checks,
    missing,
    skipped,
    falsePass,
    refused,
    reason: refused ? 'fail-closed: missing, skipped, failed, or false-pass checks' : 'all required gates reported PASS',
  };
}

export function compileCiGateReport(reported: readonly CiCheck[]) {
  const evaluation = evaluateCiGates(reported);
  return stamp({
    ...evaluation,
    deployed: false as const,
    merged: false as const,
    paidJobs: false as const,
    machineReadable: true as const,
    humanReadable: evaluation.reason,
    cacheKey: createHash('sha256').update(JSON.stringify(evaluation.checks)).digest('hex'),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.ciGates,
  });
}
