import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001VoiceExecutionReadiness } from '@/lib/tivvlejoy-ep001-voice-execution-readiness';

export const EP001_VOICE_DURABLE_LEDGER_BRIDGE_SCHEMA =
  'TIVVLEJOY_EP001_VOICE_DURABLE_LEDGER_BRIDGE_V1' as const;

const PROVEN_LEDGER_ARCHITECTURE = {
  neonProjectClass: 'TIVVLEJOY_PREVIEW_VOICE_LEDGER',
  observedSucceededExecutionCount: 11,
  observedStorageVerifiedCount: 11,
  observedAlignmentPresentCount: 11,
  requiredPersistedFieldsObserved: [
    'request_id','segment_id','character','character_count','status','provider_attempted_at',
    'audio_sha256','audio_bytes','storage_verified','audio_object_key','receipt_object_key',
    'receipt_ref','alignment_present','deployment_id','created_at','updated_at',
  ],
  architectureProvenByPriorRealExecution: true,
  ep001ExecutionPerformed: false,
} as const;

export function compileEp001VoiceDurableLedgerBridge() {
  const readiness = compileEp001VoiceExecutionReadiness();
  const rows = readiness.lines.map((line) => {
    const immutableIdentity = {
      episodeId: readiness.episodeId,
      lineId: line.lineId,
      shotId: line.shotId,
      characterId: line.characterId,
      speaker: line.speaker,
      voiceProfileVersion: line.voiceProfileVersion,
      voiceIdentityCheckpoint: line.voiceIdentityCheckpoint,
      textSha256: sha256Canonical({ text: line.text }),
      pictureWindow: line.pictureWindow,
    };
    return {
      ...immutableIdentity,
      idempotencyKey: sha256Canonical(immutableIdentity),
      providerRequestId: null,
      status: 'NOT_EXECUTED' as const,
      providerAttemptedAt: null,
      audioSha256: null,
      audioBytes: null,
      storageVerified: false as const,
      audioObjectKey: null,
      receiptObjectKey: null,
      receiptRef: null,
      alignmentPresent: false as const,
      timingSha256: null,
      humanApprovalReceiptSha256: null,
    };
  });

  const body = {
    schemaVersion: EP001_VOICE_DURABLE_LEDGER_BRIDGE_SCHEMA,
    episodeId: readiness.episodeId,
    voiceExecutionReadinessSha256: readiness.voiceExecutionReadinessSha256,
    state: 'DURABLE_LEDGER_CONTRACT_READY_PROVIDER_EXECUTION_UNAVAILABLE_HERE' as const,
    provenLedgerArchitecture: PROVEN_LEDGER_ARCHITECTURE,
    targetTableContract: {
      logicalName: 'tivvlejoy_episode_voice_executions',
      primaryIdentity: ['episode_id','line_id','idempotency_key'],
      immutableAudioIdentity: 'audio_sha256',
      neverOverwriteHashedCandidate: true,
      humanApprovalBoundToAudioSha256: true,
      alignmentRequiredForAdmission: true,
      storageVerificationRequiredForAdmission: true,
    },
    rows,
    admissionRule: 'All eight exact line rows must have provider success, audio SHA-256/bytes, verified storage, alignment/timing receipt, and explicit human approval for the exact audio hash.',
    metrics: {
      lineCount: rows.length,
      pipLineCount: rows.filter((row) => row.speaker === 'PIP').length,
      goatLineCount: rows.filter((row) => row.speaker === 'GOAT').length,
      executedLineCount: 0 as const,
      storageVerifiedLineCount: 0 as const,
      alignedLineCount: 0 as const,
      humanApprovedLineCount: 0 as const,
      provenPriorExecutionRows: 11 as const,
    },
    executionSurface: {
      currentConnectedProviderInvokerAvailable: false as const,
      providerArchitecturePreviouslyProven: true as const,
      durableDatabaseReachable: true as const,
      actualEp001SynthesisStillRequired: true as const,
    },
    authority: {
      providerExecutionPerformed: false as const,
      realEp001AudioPresent: false as const,
      durableReceiptAdmissionGranted: false as const,
      finalLipSyncAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      databaseMutationsPerformedByThisContract: 0 as const,
      voiceProviderCalls: 0 as const,
      paidRequests: 0 as const,
      audioBytesIncluded: false as const,
    },
  };

  return { ...body, voiceDurableLedgerBridgeSha256: sha256Canonical(body) };
}

export type Ep001VoiceDurableLedgerBridge = ReturnType<typeof compileEp001VoiceDurableLedgerBridge>;
