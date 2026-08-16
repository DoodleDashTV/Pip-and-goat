/**
 * Crash recovery, resumable checkpoints and corruption detection.
 *
 * Recovery is local-cache only. Before resume, current safety gates are
 * re-evaluated. A cache restore cannot skip QC or enter FINAL.
 */
import { stableHash } from '@doodle-dash/direction';
import { evaluateTheatricalGate, currentStage } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { evaluateEpisodeLaunchSafety } from '../launch-safety';
import type { OrchestrationPlan } from '../orchestration';
import type { WorkflowRun } from '../workflow';
import { summarizeWorkflow } from '../workflow';

export function planCrashRecovery(orchestration: OrchestrationPlan): {
  actions: OrchestrationPlan['recovery'];
  paidRetryAllowed: false;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.recovery;
} {
  return {
    actions: orchestration.recovery.map((action) => ({
      ...action,
      action: action.action === 'FAIL_CLOSED' ? 'FAIL_CLOSED' : 'REUSE_CACHE',
    })),
    paidRetryAllowed: false,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.recovery,
  };
}

export function buildAuditEvidence(run: WorkflowRun): {
  episodeId: string;
  terminal: WorkflowRun['terminal'];
  mayContinueToFinal: false;
  mayContinueToTheatrical: false;
  mayPublish: false;
  paidGpu: false;
  writesProductionLibrary: boolean;
  summary: ReturnType<typeof summarizeWorkflow>;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.recovery;
} {
  return {
    episodeId: run.episodeId,
    terminal: run.terminal,
    mayContinueToFinal: false,
    mayContinueToTheatrical: false,
    mayPublish: false,
    paidGpu: false,
    writesProductionLibrary: run.bundle.library.writesProductionLibrary,
    summary: summarizeWorkflow(run),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.recovery,
  };
}

export type WorkflowCheckpoint = {
  episodeId: string;
  cacheKey: string;
  payloadHash: string;
  label: 'DRAFT_NONCANONICAL';
  terminal: WorkflowRun['terminal'];
  currentStage: WorkflowRun['currentStage'];
};

export function checkpointWorkflow(run: WorkflowRun): WorkflowCheckpoint {
  const summary = summarizeWorkflow(run);
  return {
    episodeId: run.episodeId,
    cacheKey: run.cacheKey,
    payloadHash: stableHash(summary),
    label: 'DRAFT_NONCANONICAL',
    terminal: run.terminal,
    currentStage: run.currentStage,
  };
}

export function detectCorruption(checkpoint: WorkflowCheckpoint, run: WorkflowRun): {
  corrupt: boolean;
  expected: string;
  actual: string;
} {
  const actual = stableHash(summarizeWorkflow(run));
  return { corrupt: actual !== checkpoint.payloadHash, expected: checkpoint.payloadHash, actual };
}

export function resumeFromCheckpoint(input: {
  checkpoint: WorkflowCheckpoint;
  run: WorkflowRun;
}): {
  allowed: boolean;
  reason: string;
  reevaluatedSafety: true;
  theatricalAllowed: false;
  currentStage: string;
  paidRetryAllowed: false;
} {
  const theatrical = evaluateTheatricalGate();
  const stage = currentStage();
  const safety = evaluateEpisodeLaunchSafety({
    command: 'generate-final',
    intent: 'FINAL',
    characterMode: input.run.bundle.draft.characterMode,
    occupants: input.run.bundle.draft.occupants,
  });
  const corruption = detectCorruption(input.checkpoint, input.run);
  if (corruption.corrupt) {
    return {
      allowed: false,
      reason: 'Checkpoint payload hash does not match the current run.',
      reevaluatedSafety: true,
      theatricalAllowed: false,
      currentStage: stage.id,
      paidRetryAllowed: false,
    };
  }
  if (theatrical.allowed || stage.id !== 'DDP_STEPS_1_8') {
    return {
      allowed: false,
      reason: 'Refuse: recovery will not open Steps 9–16 or the theatrical gate.',
      reevaluatedSafety: true,
      theatricalAllowed: false,
      currentStage: stage.id,
      paidRetryAllowed: false,
    };
  }
  if (safety.allowed) {
    return {
      allowed: false,
      reason: 'Refuse: recovery re-evaluated generate-final and it must stay refused.',
      reevaluatedSafety: true,
      theatricalAllowed: false,
      currentStage: stage.id,
      paidRetryAllowed: false,
    };
  }
  return {
    allowed: input.run.terminal !== 'BLOCKED',
    reason: 'Local draft checkpoint may resume after re-evaluating current safety gates.',
    reevaluatedSafety: true,
    theatricalAllowed: false,
    currentStage: stage.id,
    paidRetryAllowed: false,
  };
}
