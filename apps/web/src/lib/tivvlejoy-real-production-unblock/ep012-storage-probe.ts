import {
  assertCandidateOriginAllowed,
  isPreviewOnlyVoiceRuntime,
  isProductionVoiceRuntime,
  tokensMatch,
} from '@/lib/voice-production/candidate-gates';
import { type VoiceEnv } from '@/lib/voice-production/safety';
import { VoiceProductionError } from '@/lib/voice-production/types';
import {
  assertSafeEp012ObjectKey,
  createR2Ep012AudioStorage,
  sha256Bytes,
  storageProbeMarkerBytes,
  type Ep012AudioStorage,
} from './ep012-audio-storage';
import { EP012_STORAGE_PROBE_MARKER_KEY, EP012_STORAGE_PROBE_SCHEMA } from './ep012-paid-voice-constants';
import { EP012_BLOCKER_CODES, EP012_VOICE_TEST_TOKEN_HEADER, createEp012SideEffectTracker } from './ep012-no-provider-preflight';

export type Ep012StorageProbeResult = {
  schemaVersion: typeof EP012_STORAGE_PROBE_SCHEMA;
  ok: boolean;
  status: 'VERIFIED' | 'BLOCKED';
  episodeId: 'EP012';
  markerKey: typeof EP012_STORAGE_PROBE_MARKER_KEY;
  sha256: string | null;
  byteCount: number | null;
  idempotent: true;
  providerContacted: false;
  providerRequestsMade: 0;
  sceneryAccessed: false;
  sceneryRequestsMade: 0;
  commercialBytesDownloaded: 0;
  productionEnabled: false;
  blockers: string[];
};

export type Ep012StorageProbeInput = {
  body: unknown;
  origin?: string | null;
  host?: string | null;
  testToken?: string | null;
  env?: VoiceEnv;
  storage?: Ep012AudioStorage;
};

let installedProbeStorage: Ep012AudioStorage | null = null;

export function installEp012StorageProbeStorage(storage: Ep012AudioStorage | null): void {
  installedProbeStorage = storage;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function runEp012StorageProbe(input: Ep012StorageProbeInput): Promise<Ep012StorageProbeResult> {
  const env = input.env ?? process.env;
  const tracker = createEp012SideEffectTracker();
  void tracker;
  const blockers: string[] = [];
  if (isProductionVoiceRuntime(env)) blockers.push(EP012_BLOCKER_CODES.EP012_PRODUCTION_RUNTIME_REFUSED);
  if (!isPreviewOnlyVoiceRuntime(env)) blockers.push(EP012_BLOCKER_CODES.EP012_PREVIEW_RUNTIME_REQUIRED);
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
  if (!isPlainObject(input.body) || Object.keys(input.body).some((key) => key !== 'confirmed') || input.body.confirmed !== true) {
    blockers.push(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
  }
  if (blockers.length > 0) {
    return {
      schemaVersion: EP012_STORAGE_PROBE_SCHEMA,
      ok: false,
      status: 'BLOCKED',
      episodeId: 'EP012',
      markerKey: EP012_STORAGE_PROBE_MARKER_KEY,
      sha256: null,
      byteCount: null,
      idempotent: true,
      providerContacted: false,
      providerRequestsMade: 0,
      sceneryAccessed: false,
      sceneryRequestsMade: 0,
      commercialBytesDownloaded: 0,
      productionEnabled: false,
      blockers,
    };
  }

  const storage = input.storage ?? installedProbeStorage ?? createR2Ep012AudioStorage(env);
  const marker = storageProbeMarkerBytes();
  const expectedSha = sha256Bytes(marker);
  try {
    const key = assertSafeEp012ObjectKey(EP012_STORAGE_PROBE_MARKER_KEY);
    await storage.putObject(key, marker, 'application/json');
    const readBack = await storage.getObject(key);
    if (sha256Bytes(readBack) !== expectedSha || readBack.byteLength !== marker.byteLength) {
      throw new VoiceProductionError('EP012 storage probe verification failed.', EP012_BLOCKER_CODES.EP012_STORAGE_VERIFICATION_FAILED);
    }
    return {
      schemaVersion: EP012_STORAGE_PROBE_SCHEMA,
      ok: true,
      status: 'VERIFIED',
      episodeId: 'EP012',
      markerKey: EP012_STORAGE_PROBE_MARKER_KEY,
      sha256: expectedSha,
      byteCount: marker.byteLength,
      idempotent: true,
      providerContacted: false,
      providerRequestsMade: 0,
      sceneryAccessed: false,
      sceneryRequestsMade: 0,
      commercialBytesDownloaded: 0,
      productionEnabled: false,
      blockers: [],
    };
  } catch (error) {
    const code =
      error instanceof VoiceProductionError ? error.code : EP012_BLOCKER_CODES.EP012_STORAGE_NOT_CONFIGURED;
    return {
      schemaVersion: EP012_STORAGE_PROBE_SCHEMA,
      ok: false,
      status: 'BLOCKED',
      episodeId: 'EP012',
      markerKey: EP012_STORAGE_PROBE_MARKER_KEY,
      sha256: null,
      byteCount: null,
      idempotent: true,
      providerContacted: false,
      providerRequestsMade: 0,
      sceneryAccessed: false,
      sceneryRequestsMade: 0,
      commercialBytesDownloaded: 0,
      productionEnabled: false,
      blockers: [code],
    };
  }
}
