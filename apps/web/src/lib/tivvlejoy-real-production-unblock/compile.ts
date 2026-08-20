import { buildPrivateObjectInventory, listRealPrivateObjectInventory } from '@/lib/tivvlejoy-real-input-convergence/inventory';
import type { ListedStorageObject } from '@/lib/tivvlejoy-real-input-convergence/inventory';
import { assertNoSecrets } from '@/lib/tivvlejoy-real-input-convergence/safety';
import { currentSyntheticBlenderAcceptance } from './blender-acceptance';
import { compileTrustedBlenderBootstrap } from './blender-bootstrap';
import { evaluateCommercialBlenderInspectionGate } from './commercial-gate';
import { assertNoDownloadWithoutProvenZero, evaluateRealReadCostGate, mayPerformCommercialGet } from './cost-gate';
import { compileDoNotRebuildMatrix } from './do-not-rebuild';
import { compileFirstEpisodeExternalDependencies } from './external-package';
import { compileFirstRealSourceReadPlan } from './first-read-plan';
import { compileInspectionOrder } from './inspection-order';
import { compileRealProductionTodoLedger } from './ledger';
import { compileMorningOperatorPage } from './morning';
import { compileRigArrivalChecklist } from './rig-checklist';
import { compileRigHandoffPackage } from './rig-handoff';
import { compileFirstEpisodeSceneryMinimum } from './scenery-minimum';
import { compileFirstEpisodeUnblockOrder } from './unblock-order';
import { compileVoiceCostPreflight } from './voice-cost';
import { compileEp012RealVoiceGenerationPlan } from './voice-plan';
import { compileVoiceTimingWorkflow } from './voice-timing';
import { UNBLOCK_REPORT_SCHEMA, type FirstEpisodeUnblockReport } from './types';

export type CompileUnblockInput = {
  items?: readonly ListedStorageObject[];
  listPrefix?: (prefix: string) => Promise<ListedStorageObject[]>;
  authorizeReads?: boolean;
};

export async function compileRealProductionUnblock(input: CompileUnblockInput = {}): Promise<FirstEpisodeUnblockReport> {
  const inventory = input.items
    ? buildPrivateObjectInventory({
        items: input.items,
        listingExecuted: true,
        realPrivateSourceAccessAvailable: true,
      })
    : await listRealPrivateObjectInventory({ listPrefix: input.listPrefix }).catch(() =>
        buildPrivateObjectInventory({
          items: [],
          listingExecuted: false,
          realPrivateSourceAccessAvailable: false,
          blocker: 'PRIVATE_SOURCE_LIST_UNAVAILABLE',
        }),
      );

  const firstReadPlan = compileFirstRealSourceReadPlan(inventory);
  const cost = evaluateRealReadCostGate(firstReadPlan);
  assertNoDownloadWithoutProvenZero(cost);
  if (input.authorizeReads && !mayPerformCommercialGet(cost)) {
    // Fail closed: unknown cost never becomes a GET, even if a caller asked.
  }
  const sceneryMinimum = compileFirstEpisodeSceneryMinimum();
  const inspection = compileInspectionOrder({ plan: firstReadPlan, scenery: sceneryMinimum });
  const blender = compileTrustedBlenderBootstrap();
  const blenderAcceptance = currentSyntheticBlenderAcceptance({
    blenderAvailable: blender.installedNow,
    trustedPinVerified: blender.trustedPinPresent,
  });
  const commercialGate = evaluateCommercialBlenderInspectionGate();
  const voicePlan = compileEp012RealVoiceGenerationPlan();
  const voiceCost = compileVoiceCostPreflight(voicePlan);
  const voiceTiming = compileVoiceTimingWorkflow();
  const rigHandoff = compileRigHandoffPackage();
  const rigChecklist = compileRigArrivalChecklist();
  const ledger = compileRealProductionTodoLedger();
  const report: FirstEpisodeUnblockReport = {
    schemaVersion: UNBLOCK_REPORT_SCHEMA,
    firstReadPlan,
    cost,
    sceneryMinimum,
    inspection,
    blender,
    blenderAcceptance,
    commercialGate,
    voicePlan,
    voiceCost,
    voiceTiming,
    rigHandoff,
    rigChecklist,
    externalDependencies: compileFirstEpisodeExternalDependencies(),
    unblockOrder: compileFirstEpisodeUnblockOrder(),
    doNotRebuild: compileDoNotRebuildMatrix().rows,
    ledger: ledger.items,
    morning: compileMorningOperatorPage({
      plan: firstReadPlan,
      cost,
      voice: voicePlan,
      blender,
      acceptance: blenderAcceptance,
      gate: commercialGate,
      checklist: rigChecklist,
      ledger: ledger.items,
    }),
    commercialBytesDownloaded: 0,
    voiceGenerationPerformed: false,
    runPodContacted: false,
  };
  assertNoSecrets(report);
  return report;
}
