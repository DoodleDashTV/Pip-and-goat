import { describe, expect, it } from "vitest";
import type {
  DurableLedgerEntry,
  DurableLedgerRecord,
  DurableVoiceLedgerStore,
} from "./voice-production/durable-voice-ledger";
import type { VoiceEnv } from "./voice-production/safety";
import {
  ep012AudioObjectKey,
  ep012ReceiptObjectKey,
  EP012_AUTHORIZED_CHARACTER_COUNT,
  EP012_FINAL_GLOBAL_CHARACTER_CEILING,
  EP012_FINAL_GLOBAL_REQUEST_CEILING,
} from "./tivvlejoy-real-production-unblock/ep012-paid-voice-constants";
import type { Ep012ExecutionRecord } from "./tivvlejoy-real-production-unblock/ep012-paid-voice-ledger";
import { EP012_VOICE_AUTHORIZATION } from "./tivvlejoy-real-production-unblock/ep012-voice-authorization";
import {
  compileEp012VoiceProductionHandoff,
  EP012_VOICE_HANDOFF_BLOCKERS,
  EP012_VOICE_PRODUCTION_HANDOFF_SCHEMA,
  runEp012VoiceProductionHandoff,
  type Ep012VoiceHandoffCompileInput,
} from "./tivvlejoy-real-production-unblock/ep012-voice-production-handoff";
import {
  fallbackFirstEpisodeOperatorModel,
  projectEp012VoiceHandoffForProductionControl,
  reconcileFirstEpisodeVoiceHandoff,
} from "./tivvlejoy-real-production-unblock/console-model";
import { sha256Canonical } from "./tivvlejoy-production-studio/hash";

const checkedAt = new Date("2026-08-22T00:45:00.000Z");

function completeRecord(): DurableLedgerRecord {
  return {
    available: true,
    reconciled: true,
    paidRequests: EP012_FINAL_GLOBAL_REQUEST_CEILING,
    paidCharactersUsed: EP012_FINAL_GLOBAL_CHARACTER_CEILING,
    failedAttempts: 0,
    reservedRequests: 0,
    reservedCharacters: 0,
    unfinalizedCount: 0,
    reconciliationStatus: "imported",
    reconciliationEvidence: "test-completed-ledger",
    month: "2026-08",
  };
}

function completeEntries(): DurableLedgerEntry[] {
  return EP012_VOICE_AUTHORIZATION.authorizedRequests.map(
    (authorized, index) => ({
      idempotencyKey: authorized.requestId,
      requestId: authorized.requestId,
      character: authorized.speaker === "PIP" ? "pip" : "goat",
      characterCount: authorized.characterCount,
      status: "succeeded",
      receiptRef: `private-receipt-${index}-${authorized.segmentId}`,
      createdAt: "2026-08-22T00:30:00.000Z",
      updatedAt: "2026-08-22T00:31:00.000Z",
      deploymentId: "test-preview",
    }),
  );
}

function completeExecutions(
  entries = completeEntries(),
): Ep012ExecutionRecord[] {
  return EP012_VOICE_AUTHORIZATION.authorizedRequests.map(
    (authorized, index) => ({
      requestId: authorized.requestId,
      segmentId: authorized.segmentId,
      character: authorized.speaker === "PIP" ? "pip" : "goat",
      characterCount: authorized.characterCount,
      status: "succeeded",
      providerAttemptedAt: "2026-08-22T00:30:30.000Z",
      audioSha256: sha256Canonical({
        segmentId: authorized.segmentId,
        audio: "test-fixture",
      }),
      audioBytes: 20_000 + index,
      storageVerified: true,
      audioObjectKey: ep012AudioObjectKey(authorized.segmentId),
      receiptObjectKey: ep012ReceiptObjectKey(authorized.segmentId),
      receiptRef: entries[index]!.receiptRef,
      alignmentPresent: true,
      deploymentId: "test-preview",
      createdAt: "2026-08-22T00:30:00.000Z",
      updatedAt: "2026-08-22T00:31:00.000Z",
    }),
  );
}

function completeInput(
  overrides: Partial<Ep012VoiceHandoffCompileInput> = {},
): Ep012VoiceHandoffCompileInput {
  const entries = overrides.entries
    ? [...overrides.entries]
    : completeEntries();
  return {
    previewOnlyRuntime: true,
    productionRuntime: false,
    ledgerConfigured: true,
    ledgerKind: "postgres",
    record: completeRecord(),
    entries,
    executions: completeExecutions(entries),
    checkedAt,
    ...overrides,
  };
}

function readOnlyStore(input = completeInput()): DurableVoiceLedgerStore {
  return {
    kind: input.ledgerKind,
    async read() {
      return { ...input.record };
    },
    async listEntries() {
      return input.entries.map((entry) => ({ ...entry }));
    },
    async listEp012Executions() {
      return input.executions.map((execution) => ({ ...execution }));
    },
  } as DurableVoiceLedgerStore;
}

describe("TIVVLEJOY_EP012_VOICE_PRODUCTION_HANDOFF_V1", () => {
  it("binds all 11 verified segments into seven real dialogue receipts", () => {
    const result = compileEp012VoiceProductionHandoff(completeInput());
    expect(result.schemaVersion).toBe(EP012_VOICE_PRODUCTION_HANDOFF_SCHEMA);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("HANDOFF_COMPLETE");
    expect(result.segmentCount).toBe(11);
    expect(result.dialogueReceiptCount).toBe(7);
    expect(result.characterCount).toBe(EP012_AUTHORIZED_CHARACTER_COUNT);
    expect(result.storageVerifiedCount).toBe(11);
    expect(result.exactTimingSegmentCount).toBe(11);
    expect(result.segmentChecks.every((item) => item.passed)).toBe(true);
    expect(
      result.dialogueReceipts.every((item) =>
        /^[a-f0-9]{64}$/.test(item.receiptSha256),
      ),
    ).toBe(true);
    expect(result.handoffSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("resolves the voice dependency while preserving the rig, render, and QC gates", () => {
    const result = compileEp012VoiceProductionHandoff(completeInput());
    expect(result.productionPacket?.readiness).toBe("PLANNING_COMPLETE");
    expect(
      result.productionPacket?.reasons.find((item) => item.key === "voice")
        ?.blocksRealProduction,
    ).toBe(false);
    expect(
      result.productionPacket?.reasons.find((item) => item.key === "character")
        ?.blocksRealProduction,
    ).toBe(true);
    expect(
      result.productionPacket?.reasons.find((item) => item.key === "render")
        ?.blocksRealProduction,
    ).toBe(true);
    expect(
      result.productionPacket?.reasons.find((item) => item.key === "qc")
        ?.blocksRealProduction,
    ).toBe(true);
    expect(result.studioReadiness).toBe("WAITING_FOR_CHARACTER_RIGS");
    expect(result.renderStatus).toBe("NOT_STARTED");
  });

  it("is deterministic when ledger rows arrive in a different order", () => {
    const forward = compileEp012VoiceProductionHandoff(completeInput());
    const reversedInput = completeInput();
    const reversed = compileEp012VoiceProductionHandoff({
      ...reversedInput,
      entries: [...reversedInput.entries].reverse(),
      executions: [...reversedInput.executions].reverse(),
    });
    expect(reversed.handoffSha256).toBe(forward.handoffSha256);
    expect(reversed.voiceDependencySha256).toBe(forward.voiceDependencySha256);
    expect(reversed.productionPacketSha256).toBe(
      forward.productionPacketSha256,
    );
  });

  it("does not expose private receipt references, object keys, or media bytes", () => {
    const serialized = JSON.stringify(
      compileEp012VoiceProductionHandoff(completeInput()),
    );
    expect(serialized).not.toMatch(/private-receipt-/);
    expect(serialized).not.toMatch(/audio\/EP012\//);
    expect(serialized).not.toMatch(/\.mp3|\.receipt\.json|base64/i);
  });

  it("performs no provider, storage, scenery, dialogue, or Production mutation", () => {
    const result = compileEp012VoiceProductionHandoff(completeInput());
    expect(result.providerContactedDuringHandoff).toBe(false);
    expect(result.providerRequestsMadeDuringHandoff).toBe(0);
    expect(result.storageInitializedDuringHandoff).toBe(false);
    expect(result.storageObjectsReadDuringHandoff).toBe(0);
    expect(result.sceneryAccessed).toBe(false);
    expect(result.commercialBytesDownloaded).toBe(0);
    expect(result.dialogueLockMutated).toBe(false);
    expect(result.productionEnabled).toBe(false);
    expect(result.historicalProviderRequests).toBe(11);
  });

  it("does not require the paid provider gates after generation is complete", async () => {
    const env: VoiceEnv = {
      VERCEL_ENV: "preview",
      TIVVLEJOY_VOICE_LEDGER_DURABLE: "true",
      TIVVLEJOY_VOICE_LEDGER_DATABASE_URL: "postgresql://test-ledger/unused",
      ALLOW_PAID_VOICE_GENERATION: "false",
      ELEVENLABS_API_KEY: "",
      TIVVLEJOY_VOICE_TEST_TOKEN: "",
    };
    const result = await runEp012VoiceProductionHandoff({
      env,
      store: readOnlyStore(),
      now: checkedAt,
    });
    expect(result.status).toBe("HANDOFF_COMPLETE");
    expect(result.providerRequestsMadeDuringHandoff).toBe(0);
  });

  it("fails closed in Production", () => {
    const result = compileEp012VoiceProductionHandoff(
      completeInput({ previewOnlyRuntime: false, productionRuntime: true }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.PRODUCTION_RUNTIME_REFUSED,
    );
    expect(result.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.PREVIEW_RUNTIME_REQUIRED,
    );
    expect(result.productionPacket).toBeNull();
  });

  it("fails closed when the global ledger totals are not the exact final ceilings", () => {
    const result = compileEp012VoiceProductionHandoff(
      completeInput({ record: { ...completeRecord(), paidRequests: 14 } }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.LEDGER_TOTAL_MISMATCH,
    );
  });

  it("fails closed on any failed, reserved, or unfinalized ledger state", () => {
    for (const record of [
      { ...completeRecord(), failedAttempts: 1 },
      { ...completeRecord(), reservedRequests: 1, reservedCharacters: 10 },
      { ...completeRecord(), unfinalizedCount: 1 },
    ]) {
      const result = compileEp012VoiceProductionHandoff(
        completeInput({ record }),
      );
      expect(result.status).toBe("BLOCKED");
      expect(result.blockers).toContain(
        EP012_VOICE_HANDOFF_BLOCKERS.RECOVERY_REQUIRED,
      );
    }
  });

  it("fails closed when a durable entry is missing or not succeeded", () => {
    const missingInput = completeInput();
    const missing = compileEp012VoiceProductionHandoff({
      ...missingInput,
      entries: missingInput.entries.slice(1),
    });
    expect(missing.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.ENTRY_MISSING,
    );

    const failedEntries = completeEntries();
    failedEntries[0] = {
      ...failedEntries[0]!,
      status: "failed",
      receiptRef: null,
    };
    const failed = compileEp012VoiceProductionHandoff(
      completeInput({
        entries: failedEntries,
        executions: completeExecutions(failedEntries),
      }),
    );
    expect(failed.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.ENTRY_NOT_SUCCEEDED,
    );
  });

  it("fails closed when an execution is missing or duplicated", () => {
    const missingInput = completeInput();
    const missing = compileEp012VoiceProductionHandoff({
      ...missingInput,
      executions: missingInput.executions.slice(1),
    });
    expect(missing.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_COUNT_MISMATCH,
    );
    expect(missing.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_MISSING,
    );

    const duplicateInput = completeInput();
    const duplicated = compileEp012VoiceProductionHandoff({
      ...duplicateInput,
      executions: [...duplicateInput.executions, duplicateInput.executions[0]!],
    });
    expect(duplicated.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_COUNT_MISMATCH,
    );
    expect(duplicated.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_DUPLICATE,
    );
  });

  it("fails closed when execution identity or artifact metadata changes", () => {
    const identityInput = completeInput();
    const identityExecutions = [...identityInput.executions];
    identityExecutions[0] = { ...identityExecutions[0]!, characterCount: 999 };
    const identity = compileEp012VoiceProductionHandoff({
      ...identityInput,
      executions: identityExecutions,
    });
    expect(identity.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.EXECUTION_IDENTITY_MISMATCH,
    );

    const artifactInput = completeInput();
    const artifactExecutions = [...artifactInput.executions];
    artifactExecutions[0] = {
      ...artifactExecutions[0]!,
      storageVerified: false,
      audioSha256: null,
    };
    const artifact = compileEp012VoiceProductionHandoff({
      ...artifactInput,
      executions: artifactExecutions,
    });
    expect(artifact.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.ARTIFACT_NOT_VERIFIED,
    );
  });

  it("fails closed when exact alignment evidence is missing", () => {
    const input = completeInput();
    const executions = [...input.executions];
    executions[0] = { ...executions[0]!, alignmentPresent: false };
    const result = compileEp012VoiceProductionHandoff({ ...input, executions });
    expect(result.status).toBe("BLOCKED");
    expect(result.blockers).toContain(
      EP012_VOICE_HANDOFF_BLOCKERS.ALIGNMENT_MISSING,
    );
  });

  it("sanitizes an unreadable ledger into a BLOCKED contract", async () => {
    const store: DurableVoiceLedgerStore = {
      ...readOnlyStore(),
      kind: "postgres",
      async read() {
        throw new Error("database details must not escape");
      },
      async listEntries() {
        throw new Error("not reached");
      },
      async listEp012Executions() {
        throw new Error("not reached");
      },
    };
    const env: VoiceEnv = {
      VERCEL_ENV: "preview",
      TIVVLEJOY_VOICE_LEDGER_DURABLE: "true",
      TIVVLEJOY_VOICE_LEDGER_DATABASE_URL: "postgresql://test-ledger/unused",
    };
    const result = await runEp012VoiceProductionHandoff({
      env,
      store,
      now: checkedAt,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.blockers).toEqual([EP012_VOICE_HANDOFF_BLOCKERS.UNAVAILABLE]);
    expect(JSON.stringify(result)).not.toMatch(
      /database details|postgresql:\/\//,
    );
    expect(result.providerRequestsMadeDuringHandoff).toBe(0);
  });

  it("projects the exact completed handoff as real Preview ledger evidence", () => {
    const handoff = compileEp012VoiceProductionHandoff(completeInput());
    const control = projectEp012VoiceHandoffForProductionControl(handoff);
    expect(control.evidenceClass).toBe("REAL_LEDGER");
    expect(control.status).toBe("HANDOFF_COMPLETE");
    expect(control.segmentCount).toBe(11);
    expect(control.dialogueReceiptCount).toBe(7);
    expect(control.characterCount).toBe(460);
    expect(control.packetReadiness).toBe("PLANNING_COMPLETE");
    expect(control.studioReadiness).toBe("WAITING_FOR_CHARACTER_RIGS");
    expect(control.renderStatus).toBe("NOT_STARTED");
    expect(control.providerRequestsMadeDuringHandoff).toBe(0);
    expect(control.storageObjectsReadDuringHandoff).toBe(0);
    expect(control.productionEnabled).toBe(false);
  });

  it("fails the control projection closed when a completed contract is inconsistent", () => {
    const handoff = compileEp012VoiceProductionHandoff(completeInput());
    const control = projectEp012VoiceHandoffForProductionControl({
      ...handoff,
      segmentCount: 10,
    });
    expect(control.evidenceClass).toBe("BLOCKED");
    expect(control.status).toBe("BLOCKED");
    expect(control.blockers).toContain("EP012_CONTROL_HANDOFF_MISMATCH");
    expect(control.handoffSha256).toBeNull();
    expect(control.productionEnabled).toBe(false);
  });

  it("reconciles the operator card without retaining stale voice actions", () => {
    const handoff = compileEp012VoiceProductionHandoff(completeInput());
    const original = fallbackFirstEpisodeOperatorModel();
    const result = reconcileFirstEpisodeVoiceHandoff(original, handoff);
    expect(result.firstEpisode.voiceReceiptStatus).toBe(
      "11/11 verified segments · 7/7 dialogue receipts · 460/460 characters.",
    );
    expect(result.firstEpisode.next5Actions.join(" ")).not.toMatch(
      /write or confirm|generate voices/i,
    );
    expect(result.firstEpisode.next5Actions.join(" ")).toMatch(
      /verified EP012 voice dependency/i,
    );
    expect(result.firstEpisode.next5Actions).toHaveLength(5);
  });

  it("leaves the original operator card unchanged when the handoff is blocked", () => {
    const blocked = compileEp012VoiceProductionHandoff(
      completeInput({ previewOnlyRuntime: false, productionRuntime: true }),
    );
    const original = fallbackFirstEpisodeOperatorModel();
    const result = reconcileFirstEpisodeVoiceHandoff(original, blocked);
    expect(result.firstEpisode).toEqual(original);
    expect(result.voiceHandoff.status).toBe("BLOCKED");
    expect(result.voiceHandoff.productionEnabled).toBe(false);
  });

  it("keeps request IDs, artifact hashes, and object references out of the control projection", () => {
    const handoff = compileEp012VoiceProductionHandoff(completeInput());
    const control = projectEp012VoiceHandoffForProductionControl(handoff);
    const serialized = JSON.stringify(control);
    for (const authorized of EP012_VOICE_AUTHORIZATION.authorizedRequests) {
      expect(serialized).not.toContain(authorized.requestId);
    }
    for (const execution of completeExecutions()) {
      expect(serialized).not.toContain(execution.audioSha256);
      expect(serialized).not.toContain(execution.audioObjectKey);
      expect(serialized).not.toContain(execution.receiptObjectKey);
      expect(serialized).not.toContain(execution.receiptRef);
    }
  });
});
