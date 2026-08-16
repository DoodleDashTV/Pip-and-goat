/**
 * Closed-gate contract for Studio Completion 25–32.
 *
 * Infrastructure may exist. It is not operationally unlocked.
 */
import { assertStageAllowed, currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { assertSteps9To16StillClosed, planSteps9To16Infrastructure } from '../closed-stages';
import { evaluatePaidResourcePolicy, evaluateEpisodeLaunchSafety } from '../launch-safety';
import { listDraftReferenceProvenance } from '../provenance';

export const STUDIO_COMPLETION_WORKSTREAMS = [
  'SECURITY_AND_SECRET_ROTATION',
  'LEAST_PRIVILEGE_ACCESS',
  'AUDIT_LOGGING',
  'IMMUTABLE_RELEASES',
  'CICD_QUALITY_GATES',
  'BACKUP_AND_DISASTER_RECOVERY',
  'VULNERABILITY_AND_SUPPLY_CHAIN',
  'SPEND_KILL_SWITCH_AND_GOLDEN_REGRESSION',
] as const;

export function planStudioCompletion25To32Infrastructure(): {
  stageId: 'DDP_STEPS_25_32';
  currentStage: string;
  gateAllowed: boolean;
  blockers: readonly string[];
  workstreams: Array<{ id: (typeof STUDIO_COMPLETION_WORKSTREAMS)[number]; status: 'BLOCKED' }>;
  opened: false;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.studioCompletion;
} {
  const gate = evaluateTheatricalGate();
  return {
    stageId: 'DDP_STEPS_25_32',
    currentStage: currentStage().id,
    gateAllowed: gate.allowed,
    blockers: gate.blockers,
    workstreams: STUDIO_COMPLETION_WORKSTREAMS.map((id) => ({ id, status: 'BLOCKED' as const })),
    opened: false,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.studioCompletion,
  };
}

export function assertStudioCompletion25To32StillClosed(): void {
  const plan = planStudioCompletion25To32Infrastructure();
  const steps916 = planSteps9To16Infrastructure();
  const theatrical = evaluateTheatricalGate();
  const stage = currentStage();
  if (stage.id !== 'DDP_STEPS_1_8') {
    throw new Error('Refuse: currentStage must remain DDP_STEPS_1_8.');
  }
  if (theatrical.allowed) {
    throw new Error('Refuse: theatrical gate must remain closed.');
  }
  assertSteps9To16StillClosed();
  if (steps916.opened || plan.opened || plan.gateAllowed) {
    throw new Error('Refuse: Steps 9–16 and 25–32 must remain closed.');
  }
  expectThrows(() => assertStageAllowed('DDP_STEPS_9_16'));
  expectThrows(() => assertStageAllowed('DDP_STEPS_25_32'));
  const paid = evaluatePaidResourcePolicy({ allowPaidGpu: true, estimateUsd: 1 });
  if (paid.allowed) throw new Error('Refuse: paid execution must stay refused.');
  const launch = evaluateEpisodeLaunchSafety({ command: 'generate-final', intent: 'FINAL' });
  if (launch.allowed) throw new Error('Refuse: FINAL promotion must stay refused.');
  if (listDraftReferenceProvenance().some((entry) => entry.productionLibraryPath)) {
    throw new Error('Refuse: production-library writes are forbidden.');
  }
}

function expectThrows(fn: () => void): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error('Refuse: expected stage assertion to throw.');
}
