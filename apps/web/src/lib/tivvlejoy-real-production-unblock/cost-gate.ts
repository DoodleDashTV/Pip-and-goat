import type { FirstReadPlan, RealReadAuthorization } from './types';

const UNKNOWN_COST_VARIABLES = [
  'Cloudflare R2 Class B / operation pricing is not pinned as zero-cost in this repository.',
  'Data-transfer pricing for GET of private objects is not proven zero from in-repo configuration.',
  'Whether the current account is inside a free allowance cannot be determined without live billing access.',
  'A later signed-read and the GET itself may each count as billable operations even if bytes later appear cheap.',
];

export function evaluateRealReadCostGate(plan: FirstReadPlan): RealReadAuthorization {
  return {
    state: 'REAL_READ_AUTHORIZATION_REQUIRED',
    provenZero: false,
    costState: 'UNKNOWN',
    totalBytes: plan.selectedTotalBytes,
    objectCount: plan.selectedObjectCount,
    bestEstimate: 'UNKNOWN',
    worstReasonableEstimate: 'UNKNOWN',
    unknownCostVariables: [...UNKNOWN_COST_VARIABLES],
    downloadPerformed: false,
    mutation: false,
    commercialBytesDownloaded: 0,
  };
}

export function assertNoDownloadWithoutProvenZero(decision: RealReadAuthorization): void {
  if (decision.downloadPerformed && !decision.provenZero) {
    throw new Error('REFUSED_UNPROVEN_COMMERCIAL_GET');
  }
  if (decision.mutation) {
    throw new Error('REFUSED_COST_GATE_MUTATION');
  }
}

export function mayPerformCommercialGet(decision: RealReadAuthorization): boolean {
  return decision.provenZero && decision.state === 'PROVEN_ZERO';
}
