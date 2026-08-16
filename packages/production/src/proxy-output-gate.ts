/**
 * Production-side hook for the Milestone 4 proxy output gate.
 *
 * Keeps the fail-closed rule next to the existing cost and cloud guards so a
 * FINAL / paid / production-library path cannot ignore it. Does not authorize
 * spend and does not open the theatrical gate.
 */
import {
  assertNoProxyInFinalOutput,
  evaluateProductionOutputGate,
  isProxyCode,
  type OccupantCode,
  type OutputIntent,
  type ProductionOutputGate,
} from '@doodle-dash/preproduction';

export function evaluateProxyOutputGate(intent: OutputIntent): ProductionOutputGate {
  return evaluateProductionOutputGate(intent);
}

export function assertManifestSafeForFinal(input: {
  readonly occupants?: readonly string[];
  readonly renderTier?: 'DRAFT' | 'REVIEW' | 'FINAL';
  readonly writeProductionLibrary?: boolean;
  readonly launchPaidGpu?: boolean;
}): ProductionOutputGate {
  const occupants = input.occupants ?? [];
  const renderTier = input.renderTier ?? 'DRAFT';
  const evaluation = evaluateProductionOutputGate({
    outputClass: renderTier === 'FINAL' ? 'FINAL_PRODUCTION' : 'PIPELINE_TEST',
    renderTier,
    assetQuality: 'PROTOTYPE',
    occupants: occupants.length > 0 ? [...occupants] : ['PROXY_NONCANONICAL_BIRD_A'],
    writeProductionLibrary: input.writeProductionLibrary ?? false,
    launchPaidGpu: input.launchPaidGpu ?? false,
    claimMaster: renderTier === 'FINAL',
  });

  if (occupants.some(isProxyCode)) {
    assertNoProxyInFinalOutput(occupants as OccupantCode[], renderTier);
  }

  if (input.writeProductionLibrary) {
    throw new Error('Pre-production and proxy paths must not write production-library/.');
  }
  if (input.launchPaidGpu) {
    throw new Error('Paid GPU launch is refused without Justin’s explicit approval.');
  }
  if (renderTier === 'FINAL' && occupants.some(isProxyCode)) {
    throw new Error(evaluation.blockers.join(' ') || 'Proxy occupants cannot enter FINAL output.');
  }

  return evaluation;
}
