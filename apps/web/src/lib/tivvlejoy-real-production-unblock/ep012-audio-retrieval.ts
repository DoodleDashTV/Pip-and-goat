import {
  assertCandidateOriginAllowed,
  isPreviewOnlyVoiceRuntime,
  isProductionVoiceRuntime,
  tokensMatch,
} from '@/lib/voice-production/candidate-gates';
import { resolvePreviewVoiceLedgerStore, type DurableVoiceLedgerStore } from '@/lib/voice-production/durable-voice-ledger';
import { type VoiceEnv } from '@/lib/voice-production/safety';
import { VoiceProductionError } from '@/lib/voice-production/types';
import {
  assertSafeEp012ObjectKey,
  createR2Ep012AudioStorage,
  deriveEp012ObjectKeys,
  type Ep012AudioStorage,
  type Ep012PublicReceipt,
} from './ep012-audio-storage';
import { EP012_AUDIO_RETRIEVAL_SCHEMA } from './ep012-paid-voice-constants';
import { EP012_BLOCKER_CODES, EP012_VOICE_TEST_TOKEN_HEADER, createEp012SideEffectTracker } from './ep012-no-provider-preflight';
import { deriveEp012AuthorizedRequest } from './ep012-no-provider-preflight';

export type Ep012AudioRetrievalResult =
  | {
      ok: true;
      kind: 'mp3';
      contentType: 'audio/mpeg';
      bytes: Uint8Array;
      segmentId: string;
      requestId: string;
      productionEnabled: false;
    }
  | {
      ok: true;
      kind: 'receipt';
      receipt: Ep012PublicReceipt;
      productionEnabled: false;
    }
  | {
      ok: false;
      schemaVersion: typeof EP012_AUDIO_RETRIEVAL_SCHEMA;
      status: 'BLOCKED';
      blockers: string[];
      providerContacted: false;
      providerRequestsMade: 0;
      sceneryAccessed: false;
      productionEnabled: false;
    };

export type Ep012AudioRetrievalInput = {
  segmentId: string | null;
  kind?: string | null;
  extraQueryKeys?: string[];
  objectKey?: string | null;
  origin?: string | null;
  host?: string | null;
  testToken?: string | null;
  env?: VoiceEnv;
  store?: DurableVoiceLedgerStore;
  storage?: Ep012AudioStorage;
};

let installedRetrievalStorage: Ep012AudioStorage | null = null;

export function installEp012RetrievalStorage(storage: Ep012AudioStorage | null): void {
  installedRetrievalStorage = storage;
}

export function readEp012VoiceTestTokenFromHeaders(headers: Headers): string {
  return String(headers.get(EP012_VOICE_TEST_TOKEN_HEADER) ?? '').trim();
}

export async function retrieveEp012AuthorizedAudio(input: Ep012AudioRetrievalInput): Promise<Ep012AudioRetrievalResult> {
  const env = input.env ?? process.env;
  const tracker = createEp012SideEffectTracker();
  void tracker;
  const blockers: string[] = [];
  if (isProductionVoiceRuntime(env) || !isPreviewOnlyVoiceRuntime(env)) {
    blockers.push(
      isProductionVoiceRuntime(env)
        ? EP012_BLOCKER_CODES.EP012_PRODUCTION_RUNTIME_REFUSED
        : EP012_BLOCKER_CODES.EP012_PREVIEW_RUNTIME_REQUIRED,
    );
  }
  try {
    assertCandidateOriginAllowed({ origin: input.origin, host: input.host }, env);
  } catch {
    blockers.push(EP012_BLOCKER_CODES.EP012_ORIGIN_REFUSED);
  }
  const expectedToken = String(env.TIVVLEJOY_VOICE_TEST_TOKEN ?? '').trim();
  if (!expectedToken) blockers.push(EP012_BLOCKER_CODES.EP012_TEST_TOKEN_NOT_CONFIGURED);
  else if (!tokensMatch(String(input.testToken ?? ''), expectedToken)) {
    blockers.push(EP012_BLOCKER_CODES.EP012_TEST_TOKEN_INVALID);
  }
  if ((input.extraQueryKeys ?? []).length > 0 || input.objectKey) {
    blockers.push(EP012_BLOCKER_CODES.EP012_PATH_TRAVERSAL_REFUSED);
  }
  if (!input.segmentId) {
    blockers.push(EP012_BLOCKER_CODES.EP012_SEGMENT_NOT_AUTHORIZED);
  }
  if (blockers.length > 0) {
    return {
      ok: false,
      schemaVersion: EP012_AUDIO_RETRIEVAL_SCHEMA,
      status: 'BLOCKED',
      blockers,
      providerContacted: false,
      providerRequestsMade: 0,
      sceneryAccessed: false,
      productionEnabled: false,
    };
  }

  let derived;
  try {
    derived = deriveEp012AuthorizedRequest(String(input.segmentId));
    deriveEp012ObjectKeys(derived.segmentId);
  } catch {
    return {
      ok: false,
      schemaVersion: EP012_AUDIO_RETRIEVAL_SCHEMA,
      status: 'BLOCKED',
      blockers: [EP012_BLOCKER_CODES.EP012_SEGMENT_NOT_AUTHORIZED],
      providerContacted: false,
      providerRequestsMade: 0,
      sceneryAccessed: false,
      productionEnabled: false,
    };
  }

  const store = input.store ?? resolvePreviewVoiceLedgerStore(env);
  const execution = await store.getEp012ExecutionBySegment(derived.segmentId);
  if (!execution || execution.status !== 'succeeded' || !execution.storageVerified) {
    return {
      ok: false,
      schemaVersion: EP012_AUDIO_RETRIEVAL_SCHEMA,
      status: 'BLOCKED',
      blockers: [EP012_BLOCKER_CODES.EP012_ARTIFACT_NOT_FINALIZED],
      providerContacted: false,
      providerRequestsMade: 0,
      sceneryAccessed: false,
      productionEnabled: false,
    };
  }

  const storage = input.storage ?? installedRetrievalStorage ?? createR2Ep012AudioStorage(env);
  const keys = deriveEp012ObjectKeys(derived.segmentId);
  const kind = input.kind === 'receipt' ? 'receipt' : 'mp3';
  try {
    if (kind === 'receipt') {
      const bytes = await storage.getObject(assertSafeEp012ObjectKey(keys.receiptKey));
      const receipt = JSON.parse(new TextDecoder().decode(bytes)) as Ep012PublicReceipt;
      return { ok: true, kind: 'receipt', receipt, productionEnabled: false };
    }
    const bytes = await storage.getObject(assertSafeEp012ObjectKey(keys.audioKey));
    return {
      ok: true,
      kind: 'mp3',
      contentType: 'audio/mpeg',
      bytes,
      segmentId: derived.segmentId,
      requestId: derived.requestId,
      productionEnabled: false,
    };
  } catch (error) {
    if (error instanceof VoiceProductionError) {
      return {
        ok: false,
        schemaVersion: EP012_AUDIO_RETRIEVAL_SCHEMA,
        status: 'BLOCKED',
        blockers: [error.code],
        providerContacted: false,
        providerRequestsMade: 0,
        sceneryAccessed: false,
        productionEnabled: false,
      };
    }
    return {
      ok: false,
      schemaVersion: EP012_AUDIO_RETRIEVAL_SCHEMA,
      status: 'BLOCKED',
      blockers: [EP012_BLOCKER_CODES.EP012_ARTIFACT_NOT_FINALIZED],
      providerContacted: false,
      providerRequestsMade: 0,
      sceneryAccessed: false,
      productionEnabled: false,
    };
  }
}
