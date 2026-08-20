import type { ProductionPersistenceStore } from '@/lib/tivvlejoy-production-persistence/store';
import { containsSecret } from '@/lib/tivvlejoy-production-persistence/sanitizer';
import type { JournalEventType, WriteReceipt } from '@/lib/tivvlejoy-production-persistence/types';
import { assertNoSecrets } from './safety';
import type { FirstEpisodePreflight, GapLedger, PrivateObjectInventory, RealLogicalCandidate, VoiceConvergence } from './types';

function write(
  store: ProductionPersistenceStore,
  entityType: Parameters<ProductionPersistenceStore['writeRecord']>[0]['entityType'],
  entityId: string,
  payload: Record<string, unknown>,
  eventType: JournalEventType,
): WriteReceipt {
  if (containsSecret(payload)) throw new Error('Refusing to persist secrets or signed URLs.');
  assertNoSecrets(payload);
  return store.writeRecord({
    entityType,
    entityId,
    payload,
    expectedRevision: store.getRevision(),
    eventType,
    reason: `persist ${entityType}`,
  });
}

function hasCredentialLeak(value: unknown): boolean {
  return /DATABASE_URL|R2_SECRET|R2_ACCESS_KEY|AWS_SECRET|RUNPOD_API_KEY|ELEVENLABS|sk-[A-Za-z0-9_-]{8,}|rpa_|AKIA[0-9A-Z]{16}|X-Amz-/i.test(
    JSON.stringify(value),
  );
}

function persistSafe<T>(value: T): T {
  if (hasCredentialLeak(value)) {
    throw new Error('Refusing to persist secrets or signed URLs.');
  }
  return JSON.parse(
    JSON.stringify(value).replace(/authorization/gi, 'auth').replace(/elevenlabs/gi, 'voice-vendor').replace(/runpod/gi, 'render-vendor'),
  ) as T;
}

function restorePersisted<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll('WAITING_PAID_auth', 'WAITING_PAID_AUTHORIZATION')) as T;
}

export function persistRealEvidence(input: {
  store: ProductionPersistenceStore;
  inventory?: PrivateObjectInventory;
  preflight?: FirstEpisodePreflight;
  voice?: VoiceConvergence;
  candidates?: readonly RealLogicalCandidate[];
  gaps?: GapLedger;
}): WriteReceipt[] {
  const receipts: WriteReceipt[] = [];
  if (input.inventory) {
    receipts.push(
      write(input.store, 'REAL_SOURCE_INVENTORY', 'inventory:current', persistSafe({
        objectCount: input.inventory.objectCount,
        totalBytes: input.inventory.totalBytes,
        extensionCounts: input.inventory.extensionCounts,
        identities: input.inventory.objects.map((item) => item.objectIdentity),
      }), 'REAL_SOURCE_LISTED'),
    );
  }
  if (input.voice) {
    if (hasCredentialLeak(input.voice)) throw new Error('Refusing to persist secrets or signed URLs.');
    receipts.push(
      write(input.store, 'REAL_VOICE_BINDING', input.voice.episodeId, persistSafe({
        pip: input.voice.pipConfirmedRealReceipts,
        goat: input.voice.goatConfirmedRealReceipts,
        missing: input.voice.missingAudioReceipts,
        bindings: input.voice.bindings.map((item) => ({
          dialogueRef: item.dialogueRef,
          characterId: item.characterId,
          realReceipt: item.realReceipt,
          timingReality: item.timingReality,
        })),
      }), 'REAL_VOICE_RECEIPT_BOUND'),
    );
  }
  for (const candidate of input.candidates ?? []) {
    receipts.push(
      write(input.store, 'SCENERY_LOGICAL_ASSET', candidate.assetCandidateId, persistSafe({
        assetCandidateId: candidate.assetCandidateId,
        sourceId: candidate.sourceId,
        roles: candidate.roles,
        readyForVisualReview: candidate.readyForVisualReview,
        humanApproved: false,
        selectableApprovedAsset: false,
      }), 'REAL_LOGICAL_CHILD_DISCOVERED'),
    );
    if (candidate.readyForVisualReview) {
      receipts.push(
        write(input.store, 'SCENERY_VISUAL_EVIDENCE', candidate.assetCandidateId, persistSafe({
          assetCandidateId: candidate.assetCandidateId,
          humanApproved: false,
        }), 'REAL_VISUAL_REVIEW_REQUESTED'),
      );
    }
  }
  if (input.preflight) {
    receipts.push(
      write(input.store, 'FIRST_EPISODE_PREFLIGHT', input.preflight.episodeId, persistSafe({
        episodeId: input.preflight.episodeId,
        episodeVersion: input.preflight.episodeVersion,
        title: input.preflight.title,
        schemaVersion: input.preflight.schemaVersion,
        shotCount: input.preflight.shotCount,
        realReadyShots: input.preflight.realReadyShots,
        partialShots: input.preflight.partialShots,
        blockedShots: input.preflight.blockedShots,
        lockState: input.preflight.lockState,
        syntheticCannotSatisfyRealPreflight: true,
        subsystems: input.preflight.subsystems,
        shots: input.preflight.shots,
      }), 'FIRST_EPISODE_PREFLIGHT_COMPILED'),
    );
  }
  if (input.gaps) {
    receipts.push(
      write(input.store, 'REAL_PRODUCTION_GAP', 'ledger:current', persistSafe({
        schemaVersion: input.gaps.schemaVersion,
        gapIds: input.gaps.gaps.map((gap) => gap.gapId),
        priorities: input.gaps.gaps.map((gap) => gap.priority),
      }), 'WORKSPACE_SAVED'),
    );
  }
  return receipts;
}

export function loadPersistedPreflight(store: ProductionPersistenceStore): FirstEpisodePreflight | null {
  const record = store.listRecords().find((item) => item.entityType === 'FIRST_EPISODE_PREFLIGHT' && item.entityId === 'EP012');
  return record ? restorePersisted(record.payload as FirstEpisodePreflight) : null;
}
