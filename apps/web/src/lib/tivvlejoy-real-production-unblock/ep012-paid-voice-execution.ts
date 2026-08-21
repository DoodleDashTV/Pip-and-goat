import {
  runEp012GenerateGuard,
  type Ep012GenerateGuardInput,
  type Ep012GenerateGuardResult,
} from './ep012-generate-guard';
import {
  EP012_BLOCKER_CODES,
  createEp012SideEffectTracker,
  type Ep012BlockerCode,
  type Ep012SideEffectTracker,
} from './ep012-no-provider-preflight';
import {
  EP012_FINAL_GLOBAL_CHARACTER_CEILING,
  EP012_FINAL_GLOBAL_REQUEST_CEILING,
  EP012_PAID_VOICE_EXECUTION_SCHEMA,
} from './ep012-paid-voice-constants';
import {
  buildEp012PublicReceipt,
  createMemoryEp012AudioStorage,
  createR2Ep012AudioStorage,
  createUnavailableEp012AudioStorage,
  type Ep012AudioStorage,
  type Ep012PublicReceipt,
  writeAndVerifyEp012Objects,
} from './ep012-audio-storage';
import {
  createEp012ElevenLabsTransport,
  deriveEp012ProviderRequest,
  type Ep012ProviderTransport,
} from './ep012-elevenlabs-transport';
import { isPreviewOnlyVoiceRuntime } from '@/lib/voice-production/candidate-gates';
import { readDeploymentId, resolvePreviewVoiceLedgerStore } from '@/lib/voice-production/durable-voice-ledger';
import { type VoiceEnv } from '@/lib/voice-production/safety';
import { VoiceProductionError } from '@/lib/voice-production/types';

export type Ep012PaidVoiceExecutionStatus = 'SUCCEEDED' | 'ALREADY_SUCCEEDED' | 'BLOCKED' | 'RECOVERY_REQUIRED';

export type Ep012PaidVoiceExecutionResult = {
  schemaVersion: typeof EP012_PAID_VOICE_EXECUTION_SCHEMA;
  ok: boolean;
  status: Ep012PaidVoiceExecutionStatus;
  episodeId: 'EP012';
  title: 'The Bakery Map';
  dialogueSha256: string;
  authorizationSha256: string;
  segmentId: string | null;
  requestId: string | null;
  characterCount: number | null;
  derivedRequest: Ep012GenerateGuardResult['derivedRequest'];
  requestCheck: Ep012GenerateGuardResult['requestCheck'];
  preflight: Ep012GenerateGuardResult['preflight'];
  blockers: Ep012BlockerCode[];
  readyForProviderContact: boolean;
  idempotentReplay: boolean;
  storageVerified: boolean;
  audioSha256: string | null;
  audioBytes: number | null;
  receipt: Ep012PublicReceipt | null;
  providerContacted: boolean;
  providerRequestsMade: number;
  sceneryAccessed: false;
  sceneryRequestsMade: 0;
  commercialBytesDownloaded: 0;
  dialogueLockMutated: false;
  productionEnabled: false;
};

export type Ep012PaidVoiceExecutionInput = Ep012GenerateGuardInput & {
  providerTransport?: Ep012ProviderTransport;
  storage?: Ep012AudioStorage;
};

type InstalledAdapters = {
  transport?: Ep012ProviderTransport | null;
  storage?: Ep012AudioStorage | null;
};

let installedAdapters: InstalledAdapters | null = null;

export function installEp012ExecutionAdapters(adapters: InstalledAdapters | null): void {
  installedAdapters = adapters;
}

function resolveTransport(input: Ep012PaidVoiceExecutionInput, env: VoiceEnv): Ep012ProviderTransport | null {
  return input.providerTransport ?? installedAdapters?.transport ?? (isPreviewOnlyVoiceRuntime(env) ? createEp012ElevenLabsTransport(env) : null);
}

function resolveStorage(input: Ep012PaidVoiceExecutionInput, env: VoiceEnv): Ep012AudioStorage {
  if (input.storage) return input.storage;
  if (installedAdapters?.storage) return installedAdapters.storage;
  if (isPreviewOnlyVoiceRuntime(env)) return createR2Ep012AudioStorage(env);
  return createUnavailableEp012AudioStorage();
}

function executionResult(input: {
  status: Ep012PaidVoiceExecutionStatus;
  guard: Ep012GenerateGuardResult;
  blockers?: Ep012BlockerCode[];
  idempotentReplay?: boolean;
  storageVerified?: boolean;
  audioSha256?: string | null;
  audioBytes?: number | null;
  receipt?: Ep012PublicReceipt | null;
  providerContacted?: boolean;
  providerRequestsMade?: number;
  readyForProviderContact?: boolean;
}): Ep012PaidVoiceExecutionResult {
  const blockers = [...new Set(input.blockers ?? input.guard.blockers)];
  return {
    schemaVersion: EP012_PAID_VOICE_EXECUTION_SCHEMA,
    ok: input.status === 'SUCCEEDED' || input.status === 'ALREADY_SUCCEEDED',
    status: input.status,
    episodeId: 'EP012',
    title: 'The Bakery Map',
    dialogueSha256: input.guard.dialogueSha256,
    authorizationSha256: input.guard.authorizationSha256,
    segmentId: input.guard.segmentId,
    requestId: input.guard.derivedRequest?.requestId ?? null,
    characterCount: input.guard.derivedRequest?.characterCount ?? null,
    derivedRequest: input.guard.derivedRequest,
    requestCheck: input.guard.requestCheck,
    preflight: input.guard.preflight,
    blockers,
    readyForProviderContact: input.readyForProviderContact ?? false,
    idempotentReplay: input.idempotentReplay ?? false,
    storageVerified: input.storageVerified ?? false,
    audioSha256: input.audioSha256 ?? null,
    audioBytes: input.audioBytes ?? null,
    receipt: input.receipt ?? null,
    providerContacted: input.providerContacted ?? false,
    providerRequestsMade: input.providerRequestsMade ?? 0,
    sceneryAccessed: false,
    sceneryRequestsMade: 0,
    commercialBytesDownloaded: 0,
    dialogueLockMutated: false,
    productionEnabled: false,
  };
}

function mapExecutionBlocker(error: unknown): Ep012BlockerCode {
  if (error instanceof VoiceProductionError) {
    const code = error.code as Ep012BlockerCode;
    if ((Object.values(EP012_BLOCKER_CODES) as string[]).includes(code)) return code;
    if (code === 'DUPLICATE_REQUEST') return EP012_BLOCKER_CODES.EP012_REQUEST_ALREADY_RESERVED;
    if (code === 'PRIOR_USAGE_RECONCILIATION') return EP012_BLOCKER_CODES.EP012_LEDGER_RECONCILIATION_REQUIRED;
    if (code === 'DURABLE_LEDGER_UNAVAILABLE') return EP012_BLOCKER_CODES.EP012_LEDGER_UNAVAILABLE;
    if (code === 'EP012_GLOBAL_REQUEST_CEILING') return EP012_BLOCKER_CODES.EP012_GLOBAL_REQUEST_CEILING;
    if (code === 'EP012_GLOBAL_CHARACTER_CEILING') return EP012_BLOCKER_CODES.EP012_GLOBAL_CHARACTER_CEILING;
    if (code === 'EP012_EPISODE_REQUEST_CEILING') return EP012_BLOCKER_CODES.EP012_EPISODE_REQUEST_CEILING;
    if (code === 'EP012_EPISODE_CHARACTER_CEILING') return EP012_BLOCKER_CODES.EP012_EPISODE_CHARACTER_CEILING;
    if (code === 'EP012_RECOVERY_REQUIRED') return EP012_BLOCKER_CODES.EP012_RECOVERY_REQUIRED;
    if (code === 'EP012_STORAGE_VERIFICATION_FAILED') return EP012_BLOCKER_CODES.EP012_STORAGE_VERIFICATION_FAILED;
    if (code === 'EP012_STORAGE_NOT_CONFIGURED') return EP012_BLOCKER_CODES.EP012_STORAGE_NOT_CONFIGURED;
    if (code === 'EP012_PROVIDER_RESPONSE_INVALID') return EP012_BLOCKER_CODES.EP012_PROVIDER_RESPONSE_INVALID;
    if (code === 'EP012_PROVIDER_TIMEOUT') return EP012_BLOCKER_CODES.EP012_PROVIDER_RESPONSE_INVALID;
    if (code === 'EP012_PROVIDER_AUTHORIZATION') return EP012_BLOCKER_CODES.EP012_PROVIDER_RESPONSE_INVALID;
    if (code === 'EP012_PROVIDER_QUOTA') return EP012_BLOCKER_CODES.EP012_PROVIDER_RESPONSE_INVALID;
    if (code === 'EP012_PROVIDER_REDIRECT_REFUSED') return EP012_BLOCKER_CODES.EP012_PROVIDER_RESPONSE_INVALID;
  }
  return EP012_BLOCKER_CODES.EP012_PROVIDER_RESPONSE_INVALID;
}

export async function runEp012PaidVoiceExecution(input: Ep012PaidVoiceExecutionInput): Promise<Ep012PaidVoiceExecutionResult> {
  const env = input.env ?? process.env;
  const tracker = input.tracker ?? createEp012SideEffectTracker();
  const store = input.store ?? resolvePreviewVoiceLedgerStore(env);
  const guard = await runEp012GenerateGuard({ ...input, env, store, tracker });

  if (!isPreviewOnlyVoiceRuntime(env) && !guard.blockers.includes(EP012_BLOCKER_CODES.EP012_PREVIEW_RUNTIME_REQUIRED)) {
    return executionResult({
      status: 'BLOCKED',
      guard,
      blockers: [...guard.blockers, EP012_BLOCKER_CODES.EP012_PREVIEW_RUNTIME_REQUIRED],
    });
  }

  if (guard.status === 'BLOCKED') {
    return executionResult({ status: 'BLOCKED', guard });
  }

  const derived = guard.derivedRequest;
  if (!derived) {
    return executionResult({
      status: 'BLOCKED',
      guard,
      blockers: [...guard.blockers, EP012_BLOCKER_CODES.EP012_SEGMENT_NOT_AUTHORIZED],
    });
  }

  const existingExecution = await store.getEp012Execution(derived.requestId);
  if (existingExecution?.status === 'succeeded' && existingExecution.storageVerified) {
    return executionResult({
      status: 'ALREADY_SUCCEEDED',
      guard,
      idempotentReplay: true,
      storageVerified: true,
      audioSha256: existingExecution.audioSha256,
      audioBytes: existingExecution.audioBytes,
      providerContacted: false,
      providerRequestsMade: 0,
    });
  }
  if (guard.status === 'ALREADY_SUCCEEDED') {
    return executionResult({
      status: 'ALREADY_SUCCEEDED',
      guard,
      idempotentReplay: true,
      storageVerified: Boolean(existingExecution?.storageVerified),
      audioSha256: existingExecution?.audioSha256 ?? null,
      audioBytes: existingExecution?.audioBytes ?? null,
      providerContacted: false,
      providerRequestsMade: 0,
    });
  }

  const storage = resolveStorage(input, env);
  if (storage.kind === 'unavailable') {
    return executionResult({
      status: 'BLOCKED',
      guard,
      blockers: [...guard.blockers, EP012_BLOCKER_CODES.EP012_STORAGE_NOT_CONFIGURED],
    });
  }

  const transport = resolveTransport(input, env);
  if (!transport) {
    return executionResult({
      status: 'BLOCKED',
      guard,
      blockers: [...guard.blockers, EP012_BLOCKER_CODES.EP012_PROVIDER_TRANSPORT_UNAVAILABLE],
    });
  }

  const record = await store.read();
  if (record.paidRequests + 1 > EP012_FINAL_GLOBAL_REQUEST_CEILING) {
    return executionResult({
      status: 'BLOCKED',
      guard,
      blockers: [...guard.blockers, EP012_BLOCKER_CODES.EP012_GLOBAL_REQUEST_CEILING],
    });
  }
  if (record.paidCharactersUsed + derived.characterCount > EP012_FINAL_GLOBAL_CHARACTER_CEILING) {
    return executionResult({
      status: 'BLOCKED',
      guard,
      blockers: [...guard.blockers, EP012_BLOCKER_CODES.EP012_GLOBAL_CHARACTER_CEILING],
    });
  }

  let reserved = false;
  let providerAttempted = false;
  try {
    const reservedResult = await store.reserveEp012({
      requestId: derived.requestId,
      segmentId: derived.segmentId,
      character: derived.speaker === 'PIP' ? 'pip' : 'goat',
      characterCount: derived.characterCount,
      deploymentId: readDeploymentId(env),
    });
    reserved = true;
    if (reservedResult.replay) {
      return executionResult({
        status: 'ALREADY_SUCCEEDED',
        guard,
        idempotentReplay: true,
        storageVerified: true,
        audioSha256: reservedResult.replay.audioSha256,
        audioBytes: reservedResult.replay.audioBytes,
        providerContacted: false,
        providerRequestsMade: 0,
      });
    }

    const attempt = await store.markEp012ProviderAttempt({ requestId: derived.requestId });
    providerAttempted = true;
    const providerRequest = deriveEp012ProviderRequest(derived);
    tracker.providerCalls += 1;
    const providerAudio = await transport(providerRequest);
    const receipt = buildEp012PublicReceipt({
      derived,
      audioSha256: providerAudio.audioSha256,
      audioBytes: providerAudio.audioBytes.byteLength,
      providerAttemptedAt: attempt.providerAttemptedAt ?? new Date().toISOString(),
      alignment: providerAudio.alignment,
    });
    const verified = await writeAndVerifyEp012Objects({
      storage,
      segmentId: derived.segmentId,
      audioBytes: providerAudio.audioBytes,
      receipt,
    });
    await store.finalizeEp012({
      requestId: derived.requestId,
      receiptRef: verified.receiptKey,
      audioSha256: verified.audioSha256,
      audioBytes: verified.audioBytes,
      audioObjectKey: verified.audioKey,
      receiptObjectKey: verified.receiptKey,
      alignmentPresent: true,
      createdAt: new Date().toISOString(),
    });
    return executionResult({
      status: 'SUCCEEDED',
      guard,
      storageVerified: true,
      audioSha256: verified.audioSha256,
      audioBytes: verified.audioBytes,
      receipt,
      providerContacted: true,
      providerRequestsMade: 1,
    });
  } catch (error) {
    if (reserved) {
      await store.failEp012({
        requestId: derived.requestId,
        providerContacted: providerAttempted,
      });
    }
    const blocker = mapExecutionBlocker(error);
    const recovery = providerAttempted || blocker === EP012_BLOCKER_CODES.EP012_RECOVERY_REQUIRED;
    return executionResult({
      status: recovery ? 'RECOVERY_REQUIRED' : 'BLOCKED',
      guard,
      blockers: [...guard.blockers, recovery ? EP012_BLOCKER_CODES.EP012_RECOVERY_REQUIRED : blocker, blocker],
      providerContacted: providerAttempted,
      providerRequestsMade: providerAttempted ? 1 : 0,
    });
  }
}

export function createTestEp012AudioStorage() {
  return createMemoryEp012AudioStorage();
}
