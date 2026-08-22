import {
  isPreviewOnlyVoiceRuntime,
  isProductionVoiceRuntime,
} from "@/lib/voice-production/candidate-gates";
import {
  isDurableLedgerConfigured,
  resolvePreviewVoiceLedgerStore,
  type DurableLedgerEntry,
  type DurableLedgerRecord,
  type DurableVoiceLedgerStore,
} from "@/lib/voice-production/durable-voice-ledger";
import type { VoiceEnv } from "@/lib/voice-production/safety";
import {
  GOAT_CHARACTER_ID,
  PIP_CHARACTER_ID,
} from "@/lib/voice-production/types";
import { compileEp012ProductionPacket } from "@/lib/tivvlejoy-production-studio/fixtures";
import { sha256Canonical } from "@/lib/tivvlejoy-production-studio/hash";
import type { EpisodeProductionPacket } from "@/lib/tivvlejoy-production-studio/packet";
import type { VoiceReceipt } from "@/lib/tivvlejoy-production-studio/types";
import {
  EP012_CANONICAL_DIALOGUE_LOCK,
  EP012_CANONICAL_DIALOGUE_SHA256,
  verifyEp012CanonicalDialogueLock,
} from "./ep012-canonical-dialogue";
import {
  ep012AudioObjectKey,
  ep012ReceiptObjectKey,
  EP012_AUTHORIZED_CHARACTER_COUNT,
  EP012_AUTHORIZED_REQUEST_COUNT,
  EP012_FINAL_GLOBAL_CHARACTER_CEILING,
  EP012_FINAL_GLOBAL_REQUEST_CEILING,
} from "./ep012-paid-voice-constants";
import type { Ep012ExecutionRecord } from "./ep012-paid-voice-ledger";
import {
  EP012_VOICE_AUTHORIZATION,
  verifyEp012VoiceAuthorization,
} from "./ep012-voice-authorization";

export const EP012_VOICE_PRODUCTION_HANDOFF_SCHEMA =
  "TIVVLEJOY_EP012_VOICE_PRODUCTION_HANDOFF_V1" as const;

export const EP012_VOICE_HANDOFF_BLOCKERS = {
  PRODUCTION_RUNTIME_REFUSED: "EP012_HANDOFF_PRODUCTION_RUNTIME_REFUSED",
  PREVIEW_RUNTIME_REQUIRED: "EP012_HANDOFF_PREVIEW_RUNTIME_REQUIRED",
  DIALOGUE_LOCK_INVALID: "EP012_HANDOFF_DIALOGUE_LOCK_INVALID",
  AUTHORIZATION_INVALID: "EP012_HANDOFF_AUTHORIZATION_INVALID",
  LEDGER_NOT_CONFIGURED: "EP012_HANDOFF_LEDGER_NOT_CONFIGURED",
  LEDGER_UNAVAILABLE: "EP012_HANDOFF_LEDGER_UNAVAILABLE",
  LEDGER_NOT_AUTHORITATIVE: "EP012_HANDOFF_LEDGER_NOT_AUTHORITATIVE",
  LEDGER_TOTAL_MISMATCH: "EP012_HANDOFF_LEDGER_TOTAL_MISMATCH",
  RECOVERY_REQUIRED: "EP012_HANDOFF_RECOVERY_REQUIRED",
  ENTRY_MISSING: "EP012_HANDOFF_ENTRY_MISSING",
  ENTRY_NOT_SUCCEEDED: "EP012_HANDOFF_ENTRY_NOT_SUCCEEDED",
  ENTRY_IDENTITY_MISMATCH: "EP012_HANDOFF_ENTRY_IDENTITY_MISMATCH",
  EXECUTION_COUNT_MISMATCH: "EP012_HANDOFF_EXECUTION_COUNT_MISMATCH",
  EXECUTION_MISSING: "EP012_HANDOFF_EXECUTION_MISSING",
  EXECUTION_DUPLICATE: "EP012_HANDOFF_EXECUTION_DUPLICATE",
  EXECUTION_IDENTITY_MISMATCH: "EP012_HANDOFF_EXECUTION_IDENTITY_MISMATCH",
  PROVIDER_EVIDENCE_MISSING: "EP012_HANDOFF_PROVIDER_EVIDENCE_MISSING",
  ARTIFACT_NOT_VERIFIED: "EP012_HANDOFF_ARTIFACT_NOT_VERIFIED",
  ALIGNMENT_MISSING: "EP012_HANDOFF_ALIGNMENT_MISSING",
  PRODUCTION_PACKET_MISMATCH: "EP012_HANDOFF_PRODUCTION_PACKET_MISMATCH",
  UNAVAILABLE: "EP012_HANDOFF_UNAVAILABLE",
} as const;

export type Ep012VoiceHandoffBlocker =
  (typeof EP012_VOICE_HANDOFF_BLOCKERS)[keyof typeof EP012_VOICE_HANDOFF_BLOCKERS];

export type Ep012VoiceHandoffSegmentCheck = {
  segmentId: string;
  dialogueRef: string;
  speaker: "PIP" | "GOAT";
  characterId: typeof PIP_CHARACTER_ID | typeof GOAT_CHARACTER_ID;
  requestId: string;
  characterCount: number;
  audioSha256: string | null;
  audioBytes: number | null;
  exactTimingPresent: boolean;
  receiptBindingRef: string | null;
  receiptSha256: string | null;
  passed: boolean;
  blockers: Ep012VoiceHandoffBlocker[];
};

export type Ep012VoiceProductionHandoff = {
  schemaVersion: typeof EP012_VOICE_PRODUCTION_HANDOFF_SCHEMA;
  ok: boolean;
  status: "HANDOFF_COMPLETE" | "BLOCKED";
  episodeId: "EP012";
  title: "The Bakery Map";
  checkedAt: string;
  dialogueSha256: typeof EP012_CANONICAL_DIALOGUE_SHA256;
  segmentCount: number;
  dialogueReceiptCount: number;
  characterCount: number;
  storageVerifiedCount: number;
  exactTimingSegmentCount: number;
  segmentChecks: Ep012VoiceHandoffSegmentCheck[];
  dialogueReceipts: VoiceReceipt[];
  voiceDependencySha256: string | null;
  productionPacket: EpisodeProductionPacket | null;
  productionPacketSha256: string | null;
  handoffSha256: string | null;
  studioReadiness: "WAITING_FOR_CHARACTER_RIGS";
  renderStatus: "NOT_STARTED";
  blockers: Ep012VoiceHandoffBlocker[];
  providerContactedDuringHandoff: false;
  providerRequestsMadeDuringHandoff: 0;
  historicalProviderRequests: number;
  storageInitializedDuringHandoff: false;
  storageObjectsReadDuringHandoff: 0;
  sceneryAccessed: false;
  commercialBytesDownloaded: 0;
  dialogueLockMutated: false;
  productionEnabled: false;
};

export type Ep012VoiceHandoffCompileInput = {
  previewOnlyRuntime: boolean;
  productionRuntime: boolean;
  ledgerConfigured: boolean;
  ledgerKind: DurableVoiceLedgerStore["kind"];
  record: DurableLedgerRecord;
  entries: readonly DurableLedgerEntry[];
  executions: readonly Ep012ExecutionRecord[];
  checkedAt?: Date;
};

export type Ep012VoiceHandoffRunInput = {
  env?: VoiceEnv;
  store?: DurableVoiceLedgerStore;
  now?: Date;
};

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function isSha256(value: string | null): value is string {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value));
}

function blockedReport(
  blockers: readonly Ep012VoiceHandoffBlocker[],
  checkedAt: Date,
  historicalProviderRequests = 0,
  segmentChecks: Ep012VoiceHandoffSegmentCheck[] = [],
): Ep012VoiceProductionHandoff {
  return {
    schemaVersion: EP012_VOICE_PRODUCTION_HANDOFF_SCHEMA,
    ok: false,
    status: "BLOCKED",
    episodeId: "EP012",
    title: "The Bakery Map",
    checkedAt: checkedAt.toISOString(),
    dialogueSha256: EP012_CANONICAL_DIALOGUE_SHA256,
    segmentCount: segmentChecks.filter((item) => item.passed).length,
    dialogueReceiptCount: 0,
    characterCount: segmentChecks
      .filter((item) => item.passed)
      .reduce((sum, item) => sum + item.characterCount, 0),
    storageVerifiedCount: segmentChecks.filter((item) => item.passed).length,
    exactTimingSegmentCount: segmentChecks.filter(
      (item) => item.passed && item.exactTimingPresent,
    ).length,
    segmentChecks,
    dialogueReceipts: [],
    voiceDependencySha256: null,
    productionPacket: null,
    productionPacketSha256: null,
    handoffSha256: null,
    studioReadiness: "WAITING_FOR_CHARACTER_RIGS",
    renderStatus: "NOT_STARTED",
    blockers: unique(blockers),
    providerContactedDuringHandoff: false,
    providerRequestsMadeDuringHandoff: 0,
    historicalProviderRequests,
    storageInitializedDuringHandoff: false,
    storageObjectsReadDuringHandoff: 0,
    sceneryAccessed: false,
    commercialBytesDownloaded: 0,
    dialogueLockMutated: false,
    productionEnabled: false,
  };
}

export function compileEp012VoiceProductionHandoff(
  input: Ep012VoiceHandoffCompileInput,
): Ep012VoiceProductionHandoff {
  const checkedAt = input.checkedAt ?? new Date();
  const blockers: Ep012VoiceHandoffBlocker[] = [];
  if (input.productionRuntime)
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.PRODUCTION_RUNTIME_REFUSED);
  if (!input.previewOnlyRuntime)
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.PREVIEW_RUNTIME_REQUIRED);

  try {
    verifyEp012CanonicalDialogueLock();
  } catch {
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.DIALOGUE_LOCK_INVALID);
  }
  try {
    verifyEp012VoiceAuthorization();
  } catch {
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.AUTHORIZATION_INVALID);
  }

  if (!input.ledgerConfigured)
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.LEDGER_NOT_CONFIGURED);
  if (!input.record.available || input.ledgerKind === "unavailable") {
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.LEDGER_UNAVAILABLE);
  }
  if (!input.record.reconciled || input.ledgerKind === "unavailable") {
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.LEDGER_NOT_AUTHORITATIVE);
  }
  if (
    input.record.paidRequests !== EP012_FINAL_GLOBAL_REQUEST_CEILING ||
    input.record.paidCharactersUsed !== EP012_FINAL_GLOBAL_CHARACTER_CEILING
  ) {
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.LEDGER_TOTAL_MISMATCH);
  }
  if (
    input.record.failedAttempts !== 0 ||
    input.record.reservedRequests !== 0 ||
    input.record.reservedCharacters !== 0 ||
    input.record.unfinalizedCount !== 0
  ) {
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.RECOVERY_REQUIRED);
  }

  if (input.executions.length !== EP012_AUTHORIZED_REQUEST_COUNT) {
    blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_COUNT_MISMATCH);
  }

  const entryByRequest = new Map(
    input.entries.map((entry) => [entry.requestId, entry]),
  );
  const executionsBySegment = new Map<string, Ep012ExecutionRecord[]>();
  for (const execution of input.executions) {
    const existing = executionsBySegment.get(execution.segmentId) ?? [];
    existing.push(execution);
    executionsBySegment.set(execution.segmentId, existing);
    if (
      !EP012_VOICE_AUTHORIZATION.authorizedRequests.some(
        (item) => item.segmentId === execution.segmentId,
      )
    ) {
      blockers.push(EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_IDENTITY_MISMATCH);
    }
  }

  const segmentChecks: Ep012VoiceHandoffSegmentCheck[] = [];
  for (const authorized of EP012_VOICE_AUTHORIZATION.authorizedRequests) {
    const segmentBlockers: Ep012VoiceHandoffBlocker[] = [];
    const expectedCharacter = authorized.speaker === "PIP" ? "pip" : "goat";
    const characterId =
      authorized.speaker === "PIP" ? PIP_CHARACTER_ID : GOAT_CHARACTER_ID;
    const entry = entryByRequest.get(authorized.requestId);
    if (!entry) {
      segmentBlockers.push(EP012_VOICE_HANDOFF_BLOCKERS.ENTRY_MISSING);
    } else {
      if (entry.status !== "succeeded" || !entry.receiptRef) {
        segmentBlockers.push(EP012_VOICE_HANDOFF_BLOCKERS.ENTRY_NOT_SUCCEEDED);
      }
      if (
        entry.requestId !== authorized.requestId ||
        entry.character !== expectedCharacter ||
        entry.characterCount !== authorized.characterCount
      ) {
        segmentBlockers.push(
          EP012_VOICE_HANDOFF_BLOCKERS.ENTRY_IDENTITY_MISMATCH,
        );
      }
    }

    const candidates = executionsBySegment.get(authorized.segmentId) ?? [];
    if (candidates.length === 0)
      segmentBlockers.push(EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_MISSING);
    if (candidates.length > 1)
      segmentBlockers.push(EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_DUPLICATE);
    const execution = candidates[0];
    if (execution) {
      if (
        execution.requestId !== authorized.requestId ||
        execution.segmentId !== authorized.segmentId ||
        execution.character !== expectedCharacter ||
        execution.characterCount !== authorized.characterCount ||
        execution.status !== "succeeded" ||
        execution.audioObjectKey !==
          ep012AudioObjectKey(authorized.segmentId) ||
        execution.receiptObjectKey !==
          ep012ReceiptObjectKey(authorized.segmentId) ||
        execution.receiptRef !== entry?.receiptRef
      ) {
        segmentBlockers.push(
          EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_IDENTITY_MISMATCH,
        );
      }
      if (!execution.providerAttemptedAt) {
        segmentBlockers.push(
          EP012_VOICE_HANDOFF_BLOCKERS.PROVIDER_EVIDENCE_MISSING,
        );
      }
      if (
        !execution.storageVerified ||
        !isSha256(execution.audioSha256) ||
        !execution.audioBytes ||
        execution.audioBytes <= 0 ||
        !execution.receiptRef
      ) {
        segmentBlockers.push(
          EP012_VOICE_HANDOFF_BLOCKERS.ARTIFACT_NOT_VERIFIED,
        );
      }
      if (!execution.alignmentPresent) {
        segmentBlockers.push(EP012_VOICE_HANDOFF_BLOCKERS.ALIGNMENT_MISSING);
      }
    }

    const exactBlockers = unique(segmentBlockers);
    blockers.push(...exactBlockers);
    const passed = exactBlockers.length === 0;
    const receiptSha256 =
      passed && execution
        ? sha256Canonical({
            schemaVersion: EP012_VOICE_PRODUCTION_HANDOFF_SCHEMA,
            episodeId: "EP012",
            dialogueSha256: EP012_CANONICAL_DIALOGUE_SHA256,
            dialogueRef: authorized.dialogueRef,
            segmentId: authorized.segmentId,
            segmentSha256: authorized.segmentSha256,
            speaker: authorized.speaker,
            requestId: authorized.requestId,
            receiptRef: execution.receiptRef,
            audioSha256: execution.audioSha256,
            audioBytes: execution.audioBytes,
            alignmentPresent: execution.alignmentPresent,
          })
        : null;
    segmentChecks.push({
      segmentId: authorized.segmentId,
      dialogueRef: authorized.dialogueRef,
      speaker: authorized.speaker,
      characterId,
      requestId: authorized.requestId,
      characterCount: authorized.characterCount,
      audioSha256: execution?.audioSha256 ?? null,
      audioBytes: execution?.audioBytes ?? null,
      exactTimingPresent: execution?.alignmentPresent === true,
      receiptBindingRef: receiptSha256
        ? `ep012-voice-segment://${authorized.segmentId}/${receiptSha256.slice(0, 24)}`
        : null,
      receiptSha256,
      passed,
      blockers: exactBlockers,
    });
  }

  const uniqueBlockers = unique(blockers);
  const historicalProviderRequests = input.executions.filter(
    (execution) =>
      Boolean(execution.providerAttemptedAt) ||
      execution.status === "succeeded",
  ).length;
  if (uniqueBlockers.length > 0) {
    return blockedReport(
      uniqueBlockers,
      checkedAt,
      historicalProviderRequests,
      segmentChecks,
    );
  }

  const dialogueReceipts: VoiceReceipt[] =
    EP012_CANONICAL_DIALOGUE_LOCK.lines.map((line) => {
      const segments = line.subsegments.map((segment) => {
        const check = segmentChecks.find(
          (item) => item.segmentId === segment.segmentId,
        );
        if (!check?.receiptSha256)
          throw new Error(`EP012_HANDOFF_RECEIPT_MISSING:${segment.segmentId}`);
        return {
          segmentId: segment.segmentId,
          receiptSha256: check.receiptSha256,
        };
      });
      const receiptSha256 = sha256Canonical({
        schemaVersion: EP012_VOICE_PRODUCTION_HANDOFF_SCHEMA,
        episodeId: "EP012",
        dialogueSha256: EP012_CANONICAL_DIALOGUE_SHA256,
        dialogueRef: line.dialogueRef,
        lineSha256: line.lineSha256,
        segments,
      });
      return {
        dialogueRef: line.dialogueRef,
        receiptRef: `ep012-voice-dialogue://${line.dialogueRef}/${receiptSha256.slice(0, 24)}`,
        receiptSha256,
        characterId: line.speaker,
      };
    });

  const productionPacket = compileEp012ProductionPacket(dialogueReceipts);
  const voiceReason = productionPacket.reasons.find(
    (reason) => reason.key === "voice",
  );
  const characterReason = productionPacket.reasons.find(
    (reason) => reason.key === "character",
  );
  const renderReason = productionPacket.reasons.find(
    (reason) => reason.key === "render",
  );
  const qcReason = productionPacket.reasons.find(
    (reason) => reason.key === "qc",
  );
  if (
    productionPacket.readiness !== "PLANNING_COMPLETE" ||
    voiceReason?.blocksRealProduction !== false ||
    characterReason?.blocksRealProduction !== true ||
    renderReason?.blocksRealProduction !== true ||
    qcReason?.blocksRealProduction !== true
  ) {
    return blockedReport(
      [EP012_VOICE_HANDOFF_BLOCKERS.PRODUCTION_PACKET_MISMATCH],
      checkedAt,
      historicalProviderRequests,
      segmentChecks,
    );
  }

  const handoffSha256 = sha256Canonical({
    schemaVersion: EP012_VOICE_PRODUCTION_HANDOFF_SCHEMA,
    episodeId: "EP012",
    dialogueSha256: EP012_CANONICAL_DIALOGUE_SHA256,
    segments: segmentChecks.map((item) => ({
      segmentId: item.segmentId,
      receiptSha256: item.receiptSha256,
    })),
    dialogueReceipts,
    voiceDependencySha256: productionPacket.voiceDependencySha256,
    productionPacketSha256: productionPacket.productionPacketSha256,
  });

  return {
    schemaVersion: EP012_VOICE_PRODUCTION_HANDOFF_SCHEMA,
    ok: true,
    status: "HANDOFF_COMPLETE",
    episodeId: "EP012",
    title: "The Bakery Map",
    checkedAt: checkedAt.toISOString(),
    dialogueSha256: EP012_CANONICAL_DIALOGUE_SHA256,
    segmentCount: segmentChecks.length,
    dialogueReceiptCount: dialogueReceipts.length,
    characterCount: segmentChecks.reduce(
      (sum, item) => sum + item.characterCount,
      0,
    ),
    storageVerifiedCount: segmentChecks.length,
    exactTimingSegmentCount: segmentChecks.length,
    segmentChecks,
    dialogueReceipts,
    voiceDependencySha256: productionPacket.voiceDependencySha256,
    productionPacket,
    productionPacketSha256: productionPacket.productionPacketSha256,
    handoffSha256,
    studioReadiness: "WAITING_FOR_CHARACTER_RIGS",
    renderStatus: "NOT_STARTED",
    blockers: [],
    providerContactedDuringHandoff: false,
    providerRequestsMadeDuringHandoff: 0,
    historicalProviderRequests,
    storageInitializedDuringHandoff: false,
    storageObjectsReadDuringHandoff: 0,
    sceneryAccessed: false,
    commercialBytesDownloaded: 0,
    dialogueLockMutated: false,
    productionEnabled: false,
  };
}

export async function runEp012VoiceProductionHandoff(
  input: Ep012VoiceHandoffRunInput = {},
): Promise<Ep012VoiceProductionHandoff> {
  const env = input.env ?? process.env;
  const checkedAt = input.now ?? new Date();
  const store = input.store ?? resolvePreviewVoiceLedgerStore(env);
  try {
    const [record, entries, executions] = await Promise.all([
      store.read(),
      store.listEntries(),
      store.listEp012Executions(),
    ]);
    return compileEp012VoiceProductionHandoff({
      previewOnlyRuntime: isPreviewOnlyVoiceRuntime(env),
      productionRuntime: isProductionVoiceRuntime(env),
      ledgerConfigured: isDurableLedgerConfigured(env),
      ledgerKind: store.kind,
      record,
      entries,
      executions,
      checkedAt,
    });
  } catch {
    return blockedReport([EP012_VOICE_HANDOFF_BLOCKERS.UNAVAILABLE], checkedAt);
  }
}

export function unavailableEp012VoiceProductionHandoff(
  checkedAt: Date = new Date(),
): Ep012VoiceProductionHandoff {
  return blockedReport([EP012_VOICE_HANDOFF_BLOCKERS.UNAVAILABLE], checkedAt);
}
