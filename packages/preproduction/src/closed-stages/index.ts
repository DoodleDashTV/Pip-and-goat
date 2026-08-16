/**
 * Steps 9–16 infrastructure — planning only, behind the closed theatrical gate.
 *
 * This module may describe the workstreams. It may not start them.
 * `assertStageAllowed('DDP_STEPS_9_16')` still throws. ROADMAP statuses are
 * not changed here.
 */
import { assertStageAllowed, currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';

export const STEPS_9_16_WORKSTREAMS = [
  'PREMIUM_CHARACTERS',
  'FEATURE_RIGS',
  'THEATRICAL_ENVIRONMENTS',
  'THREE_TIER_RENDER',
  'GOLDEN_SCENE',
  'REFERENCE_QUALITY_LOCK',
] as const;

export function planSteps9To16Infrastructure(): {
  stageId: 'DDP_STEPS_9_16';
  currentStage: string;
  gateAllowed: boolean;
  blockers: readonly string[];
  workstreams: Array<{ id: (typeof STEPS_9_16_WORKSTREAMS)[number]; status: 'BLOCKED' }>;
  opened: false;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.closedStages;
} {
  const gate = evaluateTheatricalGate();
  return {
    stageId: 'DDP_STEPS_9_16',
    currentStage: currentStage().id,
    gateAllowed: gate.allowed,
    blockers: gate.blockers,
    workstreams: STEPS_9_16_WORKSTREAMS.map((id) => ({ id, status: 'BLOCKED' as const })),
    opened: false,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.closedStages,
  };
}

export function assertSteps9To16StillClosed(): void {
  const plan = planSteps9To16Infrastructure();
  if (plan.gateAllowed || plan.opened || plan.currentStage !== 'DDP_STEPS_1_8') {
    throw new Error('Refuse: Steps 9–16 infrastructure must stay closed on this track.');
  }
  expectThrows(() => assertStageAllowed('DDP_STEPS_9_16'));
}

function expectThrows(fn: () => void): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error('Refuse: assertStageAllowed(DDP_STEPS_9_16) did not throw.');
}
