/**
 * Step 32a — Spend kill switch.
 *
 * Paid authorization denied by default. Fake providers and zero-cost fixtures only.
 * Never calls a real paid provider.
 */
import { createHash } from 'node:crypto';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { evaluatePaidResourcePolicy } from '../launch-safety';
import { stamp } from './labels';

export type SpendAuthorization = {
  runId: string;
  provider: string;
  resourceType: string;
  priceCeilingUsd: number;
  totalCeilingUsd: number;
  expiresAt: string;
  approvingActor: string;
};

const USED_RUNS = new Set<string>();

export function resetSpendFixtures(): void {
  USED_RUNS.clear();
}

export function evaluateSpendAuthorization(input: {
  authorization?: Partial<SpendAuthorization> | null;
  nowIso: string;
  estimatedUsd: number;
  actualUsd?: number;
  realProvider?: boolean;
}): {
  allowed: false;
  reason: string;
  estimatedUsd: number;
  actualUsd: number;
  authorized: false;
  newWorkStopped: true;
} {
  const paid = evaluatePaidResourcePolicy({
    allowPaidGpu: true,
    estimateUsd: input.estimatedUsd,
  });
  if (input.realProvider) {
    return deny(input, 'Refuse: real paid provider is forbidden.');
  }
  if (!input.authorization) return deny(input, 'Refuse: missing spend authorization.');
  const auth = input.authorization;
  if (!auth.runId || !auth.provider || !auth.resourceType || !auth.approvingActor) {
    return deny(input, 'Refuse: malformed spend authorization.');
  }
  if (!auth.expiresAt || auth.expiresAt <= input.nowIso) {
    return deny(input, 'Refuse: expired spend authorization.');
  }
  if ((auth.priceCeilingUsd ?? 0) <= 0 || (auth.totalCeilingUsd ?? 0) <= 0) {
    return deny(input, 'Refuse: ceiling missing or zero while paid work was requested.');
  }
  if (input.estimatedUsd > (auth.totalCeilingUsd ?? 0) || (input.actualUsd ?? 0) > (auth.totalCeilingUsd ?? 0)) {
    return deny(input, 'Refuse: stop new work; ceiling would be exceeded.');
  }
  if (USED_RUNS.has(auth.runId)) return deny(input, 'Refuse: authorization reuse is forbidden.');
  USED_RUNS.add(auth.runId);
  return deny(input, paid.reason);
}

function deny(
  input: { estimatedUsd: number; actualUsd?: number },
  reason: string,
): {
  allowed: false;
  reason: string;
  estimatedUsd: number;
  actualUsd: number;
  authorized: false;
  newWorkStopped: true;
} {
  return {
    allowed: false,
    reason,
    estimatedUsd: input.estimatedUsd,
    actualUsd: input.actualUsd ?? 0,
    authorized: false,
    newWorkStopped: true,
  };
}

export function compileSpendKillSwitchEvidence(decisions: Array<ReturnType<typeof evaluateSpendAuthorization>>) {
  return stamp({
    paidAuthorizationDefault: 'DENIED' as const,
    realProviderCalled: false as const,
    decisions,
    cacheKey: createHash('sha256').update(JSON.stringify(decisions)).digest('hex'),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.spend,
  });
}
