import { currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';
import {
  evaluatePaidResourcePolicy,
  planSteps9To16Infrastructure,
  planStudioCompletion25To32Infrastructure,
} from '@doodle-dash/preproduction';

/** Server/test only — do not import from client components. */
export function previewSafetySnapshot() {
  const paid = evaluatePaidResourcePolicy({ allowPaidGpu: true, estimateUsd: 1 });
  return {
    stageId: currentStage().id,
    theatricalAllowed: evaluateTheatricalGate().allowed,
    steps9to16Opened: planSteps9To16Infrastructure().opened,
    steps25to32Opened: planStudioCompletion25To32Infrastructure().opened,
    paidAllowed: paid.allowed,
  };
}
