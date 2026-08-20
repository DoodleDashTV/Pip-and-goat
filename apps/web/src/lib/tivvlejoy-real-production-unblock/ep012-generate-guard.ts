import {
  EP012_BLOCKER_CODES,
  EP012_VOICE_TEST_TOKEN_HEADER,
  createEp012SideEffectTracker,
  deriveEp012AuthorizedRequest,
  evaluateEp012RequestIntegrity,
  runEp012NoProviderPreflight,
  type Ep012BlockerCode,
  type Ep012DerivedVoiceRequest,
  type Ep012IntegrityOverrides,
  type Ep012NoProviderPreflight,
  type Ep012SideEffectTracker,
} from './ep012-no-provider-preflight';
import { assertCandidateOriginAllowed, isProductionVoiceRuntime, tokensMatch } from '@/lib/voice-production/candidate-gates';
import {
  resolvePreviewVoiceLedgerStore,
  type DurableVoiceLedgerStore,
} from '@/lib/voice-production/durable-voice-ledger';
import { type VoiceEnv } from '@/lib/voice-production/safety';
import { VoiceProductionError } from '@/lib/voice-production/types';

export const EP012_GENERATION_ROUTE_GUARD_SCHEMA = 'TIVVLEJOY_EP012_GENERATION_ROUTE_GUARD_V1' as const;

export const EP012_ALLOWED_CLIENT_FIELDS = ['segmentId', 'confirmed'] as const;

export const EP012_FORBIDDEN_CLIENT_FIELDS = [
  'canonicalText',
  'text',
  'textSha256',
  'segmentSha256',
  'dialogueSha256',
  'requestId',
  'speaker',
  'characterId',
  'voiceId',
  'providerVoiceId',
  'elevenLabsVoiceId',
  'model',
  'model_id',
  'voice_settings',
  'outputFormat',
  'output_format',
  'settings',
  'lines',
  'script',
  'queue',
  'testToken',
  'stability',
  'similarity',
  'similarity_boost',
  'style',
  'speed',
  'speakerBoost',
  'use_speaker_boost',
  'batch',
  'requests',
] as const;

export type Ep012GenerateGuardStatus = 'ELIGIBLE' | 'ALREADY_SUCCEEDED' | 'BLOCKED';

export type Ep012GenerateGuardResult = {
  schemaVersion: typeof EP012_GENERATION_ROUTE_GUARD_SCHEMA;
  ok: boolean;
  status: Ep012GenerateGuardStatus;
  episodeId: 'EP012';
  title: 'The Bakery Map';
  dialogueSha256: string;
  authorizationSha256: string;
  segmentId: string | null;
  derivedRequest: Ep012DerivedVoiceRequest | null;
  requestCheck: Ep012NoProviderPreflight['requestChecks'][number] | null;
  preflight: Ep012NoProviderPreflight;
  blockers: Ep012BlockerCode[];
  readyForProviderContact: boolean;
  providerContacted: false;
  providerRequestsMade: 0;
  sceneryAccessed: false;
  sceneryRequestsMade: 0;
  commercialBytesDownloaded: 0;
  dialogueLockMutated: false;
  productionEnabled: false;
};

export type Ep012GenerateGuardInput = {
  body: unknown;
  origin?: string | null;
  host?: string | null;
  testToken?: string | null;
  env?: VoiceEnv;
  store?: DurableVoiceLedgerStore;
  overrides?: Ep012IntegrityOverrides;
  tracker?: Ep012SideEffectTracker;
  providerTransport?: () => Promise<unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function forbiddenClientFields(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((key) => key !== 'segmentId' && key !== 'confirmed');
}

function guardResult(input: {
  status: Ep012GenerateGuardStatus;
  blockers: Ep012BlockerCode[];
  segmentId: string | null;
  derivedRequest: Ep012DerivedVoiceRequest | null;
  requestCheck: Ep012GenerateGuardResult['requestCheck'];
  preflight: Ep012NoProviderPreflight;
  readyForProviderContact: boolean;
}): Ep012GenerateGuardResult {
  return {
    schemaVersion: EP012_GENERATION_ROUTE_GUARD_SCHEMA,
    ok: input.status === 'ELIGIBLE' || input.status === 'ALREADY_SUCCEEDED',
    status: input.status,
    episodeId: 'EP012',
    title: 'The Bakery Map',
    dialogueSha256: input.preflight.dialogueSha256,
    authorizationSha256: input.preflight.authorizationSha256,
    segmentId: input.segmentId,
    derivedRequest: input.derivedRequest,
    requestCheck: input.requestCheck,
    preflight: input.preflight,
    blockers: [...new Set(input.blockers)],
    readyForProviderContact: input.readyForProviderContact,
    providerContacted: false,
    providerRequestsMade: 0,
    sceneryAccessed: false,
    sceneryRequestsMade: 0,
    commercialBytesDownloaded: 0,
    dialogueLockMutated: false,
    productionEnabled: false,
  };
}

export async function runEp012GenerateGuard(input: Ep012GenerateGuardInput): Promise<Ep012GenerateGuardResult> {
  const env = input.env ?? process.env;
  const tracker = input.tracker ?? createEp012SideEffectTracker();
  void tracker;
  const store = input.store ?? resolvePreviewVoiceLedgerStore(env);
  const episodeOverrides = input.overrides
    ? {
        authorizationSha256: input.overrides.authorizationSha256,
        authorizedSegmentCount: input.overrides.authorizedSegmentCount,
        totalCharacterCount: input.overrides.totalCharacterCount,
        applyLegacyThreeRequestAllowance: input.overrides.applyLegacyThreeRequestAllowance,
        dialogueLockInvalid: input.overrides.dialogueLockInvalid,
        authorizationInvalid: input.overrides.authorizationInvalid,
        forceLedgerAuthoritative: input.overrides.forceLedgerAuthoritative,
      }
    : undefined;
  const preflight = await runEp012NoProviderPreflight({
    env,
    store,
    overrides: episodeOverrides,
    tracker,
  });

  const blockers: Ep012BlockerCode[] = [];

  // 1-2. Preview runtime only. Refuse Production.
  if (isProductionVoiceRuntime(env)) {
    blockers.push(EP012_BLOCKER_CODES.EP012_PRODUCTION_RUNTIME_REFUSED);
  }

  // 3. Same-origin enforcement.
  try {
    assertCandidateOriginAllowed({ origin: input.origin, host: input.host }, env);
  } catch {
    blockers.push(EP012_BLOCKER_CODES.EP012_ORIGIN_REFUSED);
  }

  if (!isPlainObject(input.body)) {
    return guardResult({
      status: 'BLOCKED',
      blockers: [...blockers, EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN],
      segmentId: null,
      derivedRequest: null,
      requestCheck: null,
      preflight,
      readyForProviderContact: false,
    });
  }

  const body = input.body;
  const extraFields = forbiddenClientFields(body);

  // 4. confirmed === true.
  if (body.confirmed !== true) {
    blockers.push(EP012_BLOCKER_CODES.EP012_CONFIRMATION_REQUIRED);
  }

  // 5. Reject unauthorized client fields.
  if (extraFields.length > 0) {
    blockers.push(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
    return guardResult({
      status: 'BLOCKED',
      blockers,
      segmentId: typeof body.segmentId === 'string' ? body.segmentId : null,
      derivedRequest: null,
      requestCheck: null,
      preflight,
      readyForProviderContact: false,
    });
  }

  if (blockers.length > 0) {
    return guardResult({
      status: 'BLOCKED',
      blockers,
      segmentId: typeof body.segmentId === 'string' ? body.segmentId : null,
      derivedRequest: null,
      requestCheck: null,
      preflight,
      readyForProviderContact: false,
    });
  }

  const segmentId = typeof body.segmentId === 'string' ? body.segmentId : '';
  let derivedRequest: Ep012DerivedVoiceRequest | null = null;
  try {
    // 6-10. Dialogue lock, authorization, lookup, and server-side derivation.
    derivedRequest = deriveEp012AuthorizedRequest(segmentId);
  } catch {
    return guardResult({
      status: 'BLOCKED',
      blockers: [EP012_BLOCKER_CODES.EP012_SEGMENT_NOT_AUTHORIZED, ...preflight.blockers],
      segmentId: segmentId || null,
      derivedRequest: null,
      requestCheck: null,
      preflight,
      readyForProviderContact: false,
    });
  }

  const entry = await store.getEntry(derivedRequest.requestId);
  const requestCheck = evaluateEp012RequestIntegrity(segmentId, entry, input.overrides);
  blockers.push(...requestCheck.blockers);

  if (input.overrides?.applyLegacyThreeRequestAllowance) {
    blockers.push(EP012_BLOCKER_CODES.EP012_LEGACY_ALLOWANCE_STILL_ACTIVE);
  }

  // 19-21 and 22-25 come from the shared preflight snapshot, minus this request's own ledger state.
  const sharedBlockers = preflight.blockers.filter(
    (code) =>
      code !== EP012_BLOCKER_CODES.EP012_REQUEST_ALREADY_RESERVED &&
      code !== EP012_BLOCKER_CODES.EP012_REQUEST_FAILED_REQUIRES_REVIEW &&
      code !== EP012_BLOCKER_CODES.EP012_REQUEST_UNFINALIZED_REQUIRES_REVIEW &&
      code !== EP012_BLOCKER_CODES.EP012_LEDGER_RESERVED_REQUEST_PRESENT &&
      code !== EP012_BLOCKER_CODES.EP012_LEDGER_UNFINALIZED_REQUEST_PRESENT,
  );
  blockers.push(...sharedBlockers);

  if (preflight.ledger.reservedRequests > 0 && requestCheck.ledgerEntryStatus !== 'RESERVED') {
    blockers.push(EP012_BLOCKER_CODES.EP012_LEDGER_RESERVED_REQUEST_PRESENT);
  }
  if (preflight.ledger.unfinalizedCount > 0 && requestCheck.ledgerEntryStatus !== 'UNFINALIZED') {
    blockers.push(EP012_BLOCKER_CODES.EP012_LEDGER_UNFINALIZED_REQUEST_PRESENT);
  }

  const expectedToken = String(env.TIVVLEJOY_VOICE_TEST_TOKEN ?? '').trim();
  if (!expectedToken) {
    blockers.push(EP012_BLOCKER_CODES.EP012_TEST_TOKEN_NOT_CONFIGURED);
  } else if (!tokensMatch(String(input.testToken ?? ''), expectedToken)) {
    blockers.push(EP012_BLOCKER_CODES.EP012_TEST_TOKEN_INVALID);
  }

  const uniqueBlockers = [...new Set(blockers)];
  if (uniqueBlockers.length > 0) {
    return guardResult({
      status: 'BLOCKED',
      blockers: uniqueBlockers,
      segmentId,
      derivedRequest: input.overrides ? { ...derivedRequest, ...pickDerivedOverrides(input.overrides, derivedRequest) } : derivedRequest,
      requestCheck,
      preflight,
      readyForProviderContact: false,
    });
  }

  if (requestCheck.eligibility === 'ALREADY_SUCCEEDED') {
    return guardResult({
      status: 'ALREADY_SUCCEEDED',
      blockers: [],
      segmentId,
      derivedRequest,
      requestCheck,
      preflight,
      readyForProviderContact: false,
    });
  }

  // 33. STOP. This increment never crosses into ElevenLabs.
  if (input.providerTransport) {
    void input.providerTransport;
  }

  return guardResult({
    status: 'ELIGIBLE',
    blockers: [],
    segmentId,
    derivedRequest,
    requestCheck,
    preflight,
    readyForProviderContact: true,
  });
}

function pickDerivedOverrides(
  overrides: Ep012IntegrityOverrides,
  derived: Ep012DerivedVoiceRequest,
): Partial<Ep012DerivedVoiceRequest> {
  return {
    canonicalText: overrides.canonicalText ?? derived.canonicalText,
    textSha256: overrides.textSha256 ?? derived.textSha256,
    segmentSha256: overrides.segmentSha256 ?? derived.segmentSha256,
    requestId: overrides.requestId ?? derived.requestId,
    speaker: (overrides.speaker as Ep012DerivedVoiceRequest['speaker']) ?? derived.speaker,
    characterId: (overrides.characterId as Ep012DerivedVoiceRequest['characterId']) ?? derived.characterId,
    characterCount: overrides.characterCount ?? derived.characterCount,
    dialogueSha256: overrides.dialogueSha256 ?? derived.dialogueSha256,
  };
}

export function assertEp012GenerateClientBody(body: unknown): { segmentId: string; confirmed: true } {
  if (!isPlainObject(body)) {
    throw new VoiceProductionError('Only segmentId and confirmed are accepted.', EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
  }
  if (forbiddenClientFields(body).length > 0) {
    throw new VoiceProductionError('Client authority fields are forbidden.', EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
  }
  if (body.confirmed !== true) {
    throw new VoiceProductionError('Generation confirmation is required.', EP012_BLOCKER_CODES.EP012_CONFIRMATION_REQUIRED);
  }
  if (typeof body.segmentId !== 'string' || !body.segmentId) {
    throw new VoiceProductionError('Segment is not authorized.', EP012_BLOCKER_CODES.EP012_SEGMENT_NOT_AUTHORIZED);
  }
  return { segmentId: body.segmentId, confirmed: true };
}

export function readEp012VoiceTestToken(headers: Headers): string {
  return String(headers.get(EP012_VOICE_TEST_TOKEN_HEADER) ?? '').trim();
}
