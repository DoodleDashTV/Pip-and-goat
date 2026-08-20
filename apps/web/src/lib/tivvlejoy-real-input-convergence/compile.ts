import { adaptPurchasedAssetReceipt } from '@/lib/tivvlejoy-real-scenery-inspection/receipts';
import { listRegisteredSources } from '@/lib/scenery/source-registry';
import { detectLocalBlender } from '@/lib/tivvlejoy-real-scenery-inspection/blender';
import { sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner';
import { createMemoryStore } from '@/lib/tivvlejoy-production-persistence';
import { assertNoSecrets, realInputSafetyReport } from './safety';
import { buildMaterializationQueue, mergeBudget } from './budget';
import { blenderInstallationPlan, localBlenderSmokePlan, renderEnvironmentReadiness } from './blender-plan';
import { discoverRealLogicalCandidates, visualReviewTasksFor } from './classify-real';
import { compileFirstEpisodePreflight, approvalCountsFrom, firstEpisodeCoverage } from './preflight';
import { compileGapLedger, firstEpisodeCriticalPath, morningBrief, nextSafeActions, prioritizeGaps, humanReviewPlaybook } from './gaps';
import { inspectRealSourceBytes } from './inspect-real';
import { buildPrivateObjectInventory, listRealPrivateObjectInventory } from './inventory';
import { compileProductionLock } from './lock';
import { materializeRealSource } from './materialize';
import { reconcileReceiptsAndObjects } from './matching';
import { persistRealEvidence } from './persist';
import { currentRigReadiness, playSyntheticRigArrival, syntheticRigCannotReachApproval } from './rig-arrival';
import { bindEp012VoiceReceipts } from './voice';
import { REAL_INPUT_SCHEMA, type ListedPrivateObject, type ReadBudget, type RealLogicalCandidate, type RealStaticInspection } from './types';
import type { ListedStorageObject } from './inventory';
import type { AbstractSourceReceipt } from '@/lib/tivvlejoy-real-scenery-inspection/types';

export type CompileConvergenceInput = {
  items?: readonly ListedStorageObject[];
  receipts?: readonly AbstractSourceReceipt[];
  listPrefix?: (prefix: string) => Promise<ListedStorageObject[]>;
  readObject?: (identity: string) => Promise<Uint8Array | null>;
  objectBytes?: Record<string, Uint8Array>;
  objectNames?: Record<string, string[]>;
  budget?: Partial<ReadBudget>;
  authorizeReads?: boolean;
  persistedVoice?: Parameters<typeof bindEp012VoiceReceipts>[0];
};

export async function compileRealInputConvergence(input: CompileConvergenceInput = {}) {
  const receipts =
    input.receipts ??
    listRegisteredSources().map((source) =>
      adaptPurchasedAssetReceipt({
        sourceId: source.sourceId,
        sourceReceiptRef: `catalog:${source.sourceId}`,
        stored: false,
        sourceSha256: source.sha256,
        catalogPresent: true,
        receiptPresent: true,
        displayName: source.collectionName,
        originalFilename: source.expectedFiles[0]?.filename,
      }),
    );

  const inventory = input.items
    ? buildPrivateObjectInventory({
        items: input.items,
        receipts,
        listingExecuted: true,
        realPrivateSourceAccessAvailable: true,
      })
    : await listRealPrivateObjectInventory({ listPrefix: input.listPrefix, receipts });

  const matching = reconcileReceiptsAndObjects({ inventory, receipts });
  const budget = mergeBudget(input.budget);
  const queue = buildMaterializationQueue(inventory, budget);
  const inspections: RealStaticInspection[] = [];
  const candidates: RealLogicalCandidate[] = [];
  let downloaded = 0;
  let hashesVerified = 0;
  let totalBytesRead = 0;

  const selected = input.authorizeReads ? queue.filter((item) => item.selected) : [];
  for (const item of selected) {
    const object = inventory.objects.find((entry) => entry.objectIdentity === item.objectIdentity);
    if (!object) continue;
    const receipt =
      receipts.find((entry) => entry.sourceId === object.catalogSourceId) ??
      adaptPurchasedAssetReceipt({
        sourceId: object.catalogSourceId ?? `src:${object.objectIdentity.slice(0, 16)}`,
        sourceReceiptRef: object.knownUploadReceipt ?? `listed:${object.objectIdentity.slice(0, 16)}`,
        stored: true,
        storedByteSize: object.size,
        sourceSha256: object.knownSourceSha256,
        formatHint: object.extension,
      });
    const bytes =
      input.objectBytes?.[object.objectIdentity] ??
      (input.readObject ? await input.readObject(object.objectIdentity) : null);
    if (!bytes) continue;
    const materialized = await materializeRealSource({
      object,
      receipt,
      readBytes: async () => bytes,
      budget,
    });
    downloaded += materialized.resumedExistingReceipt ? 0 : 1;
    totalBytesRead += materialized.byteSize;
    if (materialized.hash.state === 'HASH_VERIFIED' || materialized.hash.state === 'HASH_MISSING_EXPECTED') {
      hashesVerified += materialized.hash.state === 'HASH_VERIFIED' ? 1 : 0;
    }
    if (!materialized.bytes) continue;
    const inspection = inspectRealSourceBytes({
      sourceId: receipt.sourceId,
      objectIdentity: object.objectIdentity,
      formatHint: object.extension,
      bytes: materialized.bytes,
      hash: materialized.hash,
      objectNames: input.objectNames?.[object.objectIdentity],
    });
    inspections.push(inspection);
    const names =
      input.objectNames?.[object.objectIdentity] ??
      (Array.isArray(inspection.fbx?.modelRefs) ? (inspection.fbx.modelRefs as string[]) : undefined);
    candidates.push(
      ...discoverRealLogicalCandidates({
        inspection,
        objectNames: names,
      }),
    );
  }

  const voice = bindEp012VoiceReceipts(input.persistedVoice);
  const blender = detectLocalBlender();
  const preflight = compileFirstEpisodePreflight({
    voice,
    candidates,
    realApprovedLogicalAssets: 0,
    humanApprovals: 0,
    blenderAvailable: blender.available,
    paidRenderAuthorized: false,
    realMediaReceipts: 0,
  });
  const counts = approvalCountsFrom({
    downloaded,
    hashesVerified,
    inspected: inspections.length,
    candidates,
  });
  const coverage = firstEpisodeCoverage({ candidates, realApprovedLogicalAssets: 0 });
  const gaps = compileGapLedger({
    preflight,
    voice,
    realCandidates: candidates.length,
    humanApprovals: 0,
    blenderAvailable: blender.available,
  });
  const plan = sampleEpisodeWithKnownHashes();
  const lock = compileProductionLock({
    preflight,
    scriptHash: plan.dependencyHash,
    voiceReceipts: voice.bindings.map((item) => item.receiptSha256).filter((item): item is string => Boolean(item)),
    directorPackageHash: null,
    assetRegistrySnapshot: null,
    rigVersions: { pip: null, goat: null },
    animationManifests: [],
    shotSpecs: plan.shots.map((shot) => shot.shotId),
    approvals: [],
  });
  const store = createMemoryStore({ workspaceId: 'ws_real_input_convergence' });
  const persistReceipts = persistRealEvidence({ store, inventory, preflight, voice, candidates, gaps });
  const reloaded = store.listRecords().find((item) => item.entityType === 'FIRST_EPISODE_PREFLIGHT');
  const report = {
    schemaVersion: REAL_INPUT_SCHEMA,
    inventory,
    matching,
    queue,
    inspections,
    candidates,
    reviewTasks: candidates.map(visualReviewTasksFor),
    voice,
    rigs: currentRigReadiness(),
    syntheticRigPlaybook: {
      pip: playSyntheticRigArrival('PIP'),
      goat: playSyntheticRigArrival('GOAT'),
    },
    preflight,
    counts,
    coverage,
    gaps,
    prioritizedGaps: prioritizeGaps(gaps),
    criticalPath: firstEpisodeCriticalPath(gaps),
    nextSafeActions: nextSafeActions(gaps),
    morningBrief: morningBrief({
      listedObjects: inventory.objectCount,
      realDownloads: downloaded,
      realInspections: inspections.length,
      realCandidates: candidates.length,
      voice,
    }),
    lock,
    blender: blenderInstallationPlan(),
    blenderSmoke: localBlenderSmokePlan(),
    render: renderEnvironmentReadiness(),
    humanReviewPlaybook: humanReviewPlaybook(),
    persistReceipts,
    persistenceRestarted: Boolean(reloaded),
    totalBytesRead,
    safety: realInputSafetyReport(),
  };
  syntheticRigCannotReachApproval(report.syntheticRigPlaybook.pip);
  assertNoSecrets(report);
  return report;
}

export function listedObjectByRole(objects: readonly ListedPrivateObject[], role: ListedPrivateObject['knownPackageRole']) {
  return objects.filter((item) => item.knownPackageRole === role);
}
