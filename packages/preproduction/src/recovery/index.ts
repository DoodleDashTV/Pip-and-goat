/**
 * Crash recovery and audit evidence for local draft workflows.
 *
 * Recovery is local-cache only. Paid retry is refused.
 */
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
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
