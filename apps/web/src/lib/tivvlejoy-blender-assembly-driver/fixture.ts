import { assembleEp012, MAP_PROP_CONTINUITY, UNRESOLVED } from '@/lib/tivvlejoy-shot-assembly-manifest';
import { buildBlenderAssemblyPlan, diffBlenderPlans } from './plan';

export function storyPropStatesForShot(shotId: string): Record<string, string> {
  const state = MAP_PROP_CONTINUITY.stateByShot[shotId];
  return state ? { MAP_PROP_001: state } : {};
}

export function dryRunEp012() {
  const assembly = assembleEp012();
  const plans = assembly.manifests.map((manifest) =>
    buildBlenderAssemblyPlan(manifest, {
      storyPropStates: storyPropStatesForShot(manifest.shotId),
    }),
  );
  const selfDiffs = plans.map((plan) => diffBlenderPlans(plan, plan));
  return {
    episodeId: assembly.episodeId,
    title: assembly.title,
    assembly,
    plans,
    selfDiffs,
    metrics: {
      shotCount: plans.length,
      planCount: plans.length,
      scriptCount: plans.length,
      auditCount: plans.filter((item) => item.audit.safe).length,
      dryRunValidWithUnresolved: plans.filter((item) => item.simulation.simulationResult === 'DRY_RUN_VALID_WITH_UNRESOLVED_ASSETS').length,
      executionAuthorizedCount: plans.filter((item) => item.executionAuthorized).length,
      blenderExecutedCount: plans.filter((item) => item.blenderExecuted).length,
    },
    safety: {
      blenderExecuted: false,
      subprocessExecuted: false,
      networkProviderContacted: false,
      runpodContacted: false,
      gpuLaunched: false,
      paidCompute: false,
      botaniqProcessed: false,
      commercialBytesRead: false,
      purchasedAssetsTouched: false,
    },
  };
}

export function unresolvedRef() {
  return UNRESOLVED;
}
