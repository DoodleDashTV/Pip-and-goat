/**
 * Read-only studio dashboard status.
 *
 * Consumes existing direction / preproduction / production interfaces.
 * Does not duplicate or override gate logic.
 */
import { currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';
import {
  buildEpisode1DraftPackage,
  planSteps9To16Infrastructure,
  planStudioCompletion25To32Infrastructure,
} from '@doodle-dash/preproduction';
import { readProviderStatus } from '@doodle-dash/production';

export type StudioDashboardStatus = {
  stageId: string;
  theatricalGateLabel: 'Closed' | 'Open';
  theatricalAllowed: boolean;
  steps9to16Label: 'Closed' | 'Open';
  steps9to16Opened: boolean;
  steps25to32Label: 'Closed' | 'Open';
  steps25to32Opened: boolean;
  episode1Label: string;
  episode1Canonical: boolean;
  episode1ProductionReady: boolean;
  paidResourcesAuthorized: boolean;
  paidResourcesLabel: string;
  theatricalBindingCompleted: boolean;
  theatricalBindingLabel: string;
};

export function readStudioDashboardStatus(): StudioDashboardStatus {
  const stage = currentStage();
  const theatrical = evaluateTheatricalGate();
  const steps916 = planSteps9To16Infrastructure();
  const steps2532 = planStudioCompletion25To32Infrastructure();
  const episode1 = buildEpisode1DraftPackage();
  const provider = readProviderStatus();

  return {
    stageId: stage.id,
    theatricalGateLabel: theatrical.allowed ? 'Open' : 'Closed',
    theatricalAllowed: theatrical.allowed,
    steps9to16Label: steps916.opened ? 'Open' : 'Closed',
    steps9to16Opened: steps916.opened,
    steps25to32Label: steps2532.opened ? 'Open' : 'Closed',
    steps25to32Opened: steps2532.opened,
    episode1Label: episode1.label,
    episode1Canonical: episode1.canonical,
    episode1ProductionReady: episode1.productionEligible,
    paidResourcesAuthorized: !provider.requiresAuthorization,
    paidResourcesLabel: provider.requiresAuthorization ? 'Not authorized' : 'Authorized',
    theatricalBindingCompleted: theatrical.allowed,
    theatricalBindingLabel: theatrical.allowed ? 'Completed' : 'Not completed',
  };
}
