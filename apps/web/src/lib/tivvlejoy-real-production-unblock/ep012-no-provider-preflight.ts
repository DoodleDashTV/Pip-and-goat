import {
  EP012_CANONICAL_DIALOGUE_LOCK,
  EP012_CANONICAL_DIALOGUE_SHA256,
  verifyEp012CanonicalDialogueLock,
} from './ep012-canonical-dialogue';
import {
  EP012_VOICE_AUTHORIZATION,
  EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256,
  EP012_VOICE_AUTHORIZATION_SHA256,
  getEp012AuthorizedVoiceRequest,
  verifyEp012VoiceAuthorization,
  type Ep012AuthorizedVoiceRequest,
} from './ep012-voice-authorization';
import {
  assertCandidateOriginAllowed,
  isPreviewOnlyVoiceRuntime,
  isProductionVoiceRuntime,
  testTokenConfigured,
  tokensMatch,
  voiceTestMaxCharactersGateOpen,
} from '@/lib/voice-production/candidate-gates';
import {
  isDurableLedgerConfigured,
  resolvePreviewVoiceLedgerStore,
  speakerFromCharacterId,
  type DurableEntryStatus,
  type DurableLedgerEntry,
  type DurableVoiceLedgerStore,
} from '@/lib/voice-production/durable-voice-ledger';
import { isCanonicalPaidVoiceAuthorization } from '@/lib/voice-production/paid-authorization-convention';
import { hasElevenLabsApiKey, isPaidVoiceGenerationEnabled, type VoiceEnv } from '@/lib/voice-production/safety';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError, type RegisteredCharacterId } from '@/lib/voice-production/types';
import {
  EP012_FINAL_GLOBAL_CHARACTER_CEILING,
  EP012_FINAL_GLOBAL_REQUEST_CEILING,
} from './ep012-paid-voice-constants';

export const EP012_NO_PROVIDER_PREFLIGHT_SCHEMA = 'TIVVLEJOY_EP012_NO_PROVIDER_PREFLIGHT_V1' as const;
export const EP012_REQUIRED_DIALOGUE_SHA256 =
  'f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4' as const;
export const EP012_VOICE_TEST_TOKEN_HEADER = 'x-tivvlejoy-voice-test-token' as const;

export const EP012_AUTHORIZED_SEGMENT_IDS = [
  'DL_HOOK_01__PIP',
  'DL_HOOK_01__GOAT',
  'DL_DISCOVERY_01__PIP',
  'DL_DECISION_01__GOAT',
  'DL_ACTION_01__PIP',
  'DL_ACTION_01__GOAT',
  'DL_COMPLICATION_01__GOAT',
  'DL_COMPLICATION_01__PIP',
  'DL_PAYOFF_01__PIP',
  'DL_BUTTON_01__GOAT',
  'DL_BUTTON_01__PIP',
] as const;

export type Ep012AuthorizedSegmentId = (typeof EP012_AUTHORIZED_SEGMENT_IDS)[number];

export const EP012_BLOCKER_CODES = {
  EP012_PRODUCTION_RUNTIME_REFUSED: 'EP012_PRODUCTION_RUNTIME_REFUSED',
  EP012_CONFIRMATION_REQUIRED: 'EP012_CONFIRMATION_REQUIRED',
  EP012_ORIGIN_REFUSED: 'EP012_ORIGIN_REFUSED',
  EP012_CLIENT_FIELD_FORBIDDEN: 'EP012_CLIENT_FIELD_FORBIDDEN',
  EP012_PAID_VOICE_DISABLED: 'EP012_PAID_VOICE_DISABLED',
  EP012_PAID_AUTH_CONVENTION_MISMATCH: 'EP012_PAID_AUTH_CONVENTION_MISMATCH',
  EP012_API_KEY_NOT_CONFIGURED: 'EP012_API_KEY_NOT_CONFIGURED',
  EP012_TEST_TOKEN_NOT_CONFIGURED: 'EP012_TEST_TOKEN_NOT_CONFIGURED',
  EP012_TEST_TOKEN_INVALID: 'EP012_TEST_TOKEN_INVALID',
  EP012_CHARACTER_GATE_CLOSED: 'EP012_CHARACTER_GATE_CLOSED',
  EP012_LEDGER_NOT_CONFIGURED: 'EP012_LEDGER_NOT_CONFIGURED',
  EP012_LEDGER_UNAVAILABLE: 'EP012_LEDGER_UNAVAILABLE',
  EP012_LEDGER_RECONCILIATION_REQUIRED: 'EP012_LEDGER_RECONCILIATION_REQUIRED',
  EP012_LEDGER_NOT_AUTHORITATIVE: 'EP012_LEDGER_NOT_AUTHORITATIVE',
  EP012_LEDGER_RESERVED_REQUEST_PRESENT: 'EP012_LEDGER_RESERVED_REQUEST_PRESENT',
  EP012_LEDGER_UNFINALIZED_REQUEST_PRESENT: 'EP012_LEDGER_UNFINALIZED_REQUEST_PRESENT',
  EP012_DIALOGUE_LOCK_INVALID: 'EP012_DIALOGUE_LOCK_INVALID',
  EP012_DIALOGUE_HASH_MISMATCH: 'EP012_DIALOGUE_HASH_MISMATCH',
  EP012_AUTHORIZATION_INVALID: 'EP012_AUTHORIZATION_INVALID',
  EP012_AUTHORIZATION_HASH_MISMATCH: 'EP012_AUTHORIZATION_HASH_MISMATCH',
  EP012_AUTHORIZED_COUNT_MISMATCH: 'EP012_AUTHORIZED_COUNT_MISMATCH',
  EP012_AUTHORIZED_CHARACTER_BUDGET_MISMATCH: 'EP012_AUTHORIZED_CHARACTER_BUDGET_MISMATCH',
  EP012_LEGACY_ALLOWANCE_STILL_ACTIVE: 'EP012_LEGACY_ALLOWANCE_STILL_ACTIVE',
  EP012_SEGMENT_NOT_AUTHORIZED: 'EP012_SEGMENT_NOT_AUTHORIZED',
  EP012_REQUEST_ID_MISMATCH: 'EP012_REQUEST_ID_MISMATCH',
  EP012_DIALOGUE_REF_MISMATCH: 'EP012_DIALOGUE_REF_MISMATCH',
  EP012_SPEAKER_MISMATCH: 'EP012_SPEAKER_MISMATCH',
  EP012_CHARACTER_BINDING_MISMATCH: 'EP012_CHARACTER_BINDING_MISMATCH',
  EP012_TEXT_MISMATCH: 'EP012_TEXT_MISMATCH',
  EP012_CHARACTER_COUNT_MISMATCH: 'EP012_CHARACTER_COUNT_MISMATCH',
  EP012_TEXT_HASH_MISMATCH: 'EP012_TEXT_HASH_MISMATCH',
  EP012_SEGMENT_HASH_MISMATCH: 'EP012_SEGMENT_HASH_MISMATCH',
  EP012_REQUEST_ALREADY_RESERVED: 'EP012_REQUEST_ALREADY_RESERVED',
  EP012_REQUEST_FAILED_REQUIRES_REVIEW: 'EP012_REQUEST_FAILED_REQUIRES_REVIEW',
  EP012_REQUEST_UNFINALIZED_REQUIRES_REVIEW: 'EP012_REQUEST_UNFINALIZED_REQUIRES_REVIEW',
  EP012_PREVIEW_RUNTIME_REQUIRED: 'EP012_PREVIEW_RUNTIME_REQUIRED',
  EP012_GLOBAL_REQUEST_CEILING: 'EP012_GLOBAL_REQUEST_CEILING',
  EP012_GLOBAL_CHARACTER_CEILING: 'EP012_GLOBAL_CHARACTER_CEILING',
  EP012_EPISODE_REQUEST_CEILING: 'EP012_EPISODE_REQUEST_CEILING',
  EP012_EPISODE_CHARACTER_CEILING: 'EP012_EPISODE_CHARACTER_CEILING',
  EP012_RECOVERY_REQUIRED: 'EP012_RECOVERY_REQUIRED',
  EP012_STORAGE_VERIFICATION_FAILED: 'EP012_STORAGE_VERIFICATION_FAILED',
  EP012_STORAGE_NOT_CONFIGURED: 'EP012_STORAGE_NOT_CONFIGURED',
  EP012_PROVIDER_RESPONSE_INVALID: 'EP012_PROVIDER_RESPONSE_INVALID',
  EP012_PROVIDER_TRANSPORT_UNAVAILABLE: 'EP012_PROVIDER_TRANSPORT_UNAVAILABLE',
  EP012_PATH_TRAVERSAL_REFUSED: 'EP012_PATH_TRAVERSAL_REFUSED',
  EP012_ARTIFACT_NOT_FINALIZED: 'EP012_ARTIFACT_NOT_FINALIZED',
} as const;

export type Ep012BlockerCode = (typeof EP012_BLOCKER_CODES)[keyof typeof EP012_BLOCKER_CODES];

export type Ep012LedgerEntryStatus = 'ABSENT' | 'SUCCEEDED' | 'RESERVED' | 'FAILED' | 'UNFINALIZED';
export type Ep012RequestEligibility = 'ELIGIBLE' | 'ALREADY_SUCCEEDED' | 'BLOCKED';

export type Ep012DerivedVoiceRequest = {
  requestId: string;
  episodeId: 'EP012';
  dialogueRef: Ep012AuthorizedVoiceRequest['dialogueRef'];
  segmentId: string;
  speaker: Ep012AuthorizedVoiceRequest['speaker'];
  characterId: RegisteredCharacterId;
  canonicalText: string;
  characterCount: number;
  textSha256: string;
  segmentSha256: string;
  dialogueSha256: string;
};

export type Ep012IntegrityOverrides = {
  canonicalText?: string;
  textSha256?: string;
  segmentSha256?: string;
  requestId?: string;
  speaker?: string;
  characterId?: string;
  characterCount?: number;
  dialogueSha256?: string;
  authorizationSha256?: string;
  authorizedSegmentCount?: number;
  totalCharacterCount?: number;
  applyLegacyThreeRequestAllowance?: boolean;
  dialogueLockInvalid?: boolean;
  authorizationInvalid?: boolean;
  forceLedgerAuthoritative?: boolean;
};

export type Ep012SideEffectTracker = {
  providerCalls: number;
  sceneryReads: number;
  r2Gets: number;
  dialogueWrites: number;
};

export type Ep012RequestCheck = {
  segmentId: string;
  requestId: string;
  episodeId: 'EP012';
  dialogueRef: string;
  speaker: string;
  characterId: string;
  characterCount: number;
  textSha256: string;
  segmentSha256: string;
  dialogueSha256: string;
  ledgerEntryStatus: Ep012LedgerEntryStatus;
  eligibility: Ep012RequestEligibility;
  passed: boolean;
  blockers: Ep012BlockerCode[];
};

export type Ep012NoProviderPreflight = {
  schemaVersion: typeof EP012_NO_PROVIDER_PREFLIGHT_SCHEMA;
  ok: boolean;
  status: 'READY' | 'BLOCKED' | 'COMPLETE';
  episodeId: 'EP012';
  title: 'The Bakery Map';
  dialogueSha256: string;
  authorizationSha256: string;
  checkedAt: string;
  serverGates: {
    previewRuntime: boolean;
    previewOnlyRuntime: boolean;
    productionRuntime: boolean;
    paidVoiceGenerationEnabled: boolean;
    paidAuthorizationConvention: boolean;
    elevenLabsApiKeyConfigured: boolean;
    voiceTestTokenConfigured: boolean;
    voiceTestMaxCharactersGate: boolean;
    sameOriginEnforced: boolean;
    allPassed: boolean;
  };
  ledger: {
    configured: boolean;
    available: boolean;
    reconciled: boolean;
    authoritative: boolean;
    month: string;
    globalPaidRequests: number;
    globalPaidCharactersUsed: number;
    failedAttempts: number;
    reservedRequests: number;
    reservedCharacters: number;
    unfinalizedCount: number;
    reservations: number;
    unfinalized: number;
    recoveryRequired: number;
    ep012SucceededRequests: number;
    ep012SucceededCharacters: number;
    ep012RemainingRequests: number;
    ep012RemainingCharacters: number;
    authorizedRequests: 11;
    authorizedCharacters: 460;
    completedRequests: number;
    completedCharacters: number;
    remainingRequests: number;
    remainingCharacters: number;
    expectedFinalGlobalRequests: 15;
    expectedFinalGlobalCharacters: 695;
    providerRequestsMade: number;
    storageVerifiedCount: number;
    allArtifactsStorageVerified: boolean;
    nextProviderContactPermitted: boolean;
    allPassed: boolean;
  };
  authorization: {
    issued: boolean;
    verified: boolean;
    authorizedSegmentCount: number;
    maxProviderRequests: number;
    pipCharacterCount: number;
    goatCharacterCount: number;
    totalCharacterCount: number;
    oneRequestPerSpeaker: true;
    automaticRetryAllowed: false;
    legacyThreeRequestAllowanceAppliedToEp012: false;
    dialogueLockMutationAllowed: false;
    sceneryAccessAllowed: false;
    allPassed: boolean;
  };
  requestChecks: Ep012RequestCheck[];
  totalRequestChecks: 11;
  passedRequestChecks: number;
  blockedRequestChecks: number;
  blockers: Ep012BlockerCode[];
  readyForProviderContact: boolean;
  nextProviderContactPermitted: boolean;
  providerContacted: false;
  providerRequestsMade: number;
  sceneryAccessed: false;
  sceneryRequestsMade: 0;
  commercialBytesDownloaded: 0;
  dialogueLockMutated: false;
  productionEnabled: false;
};

export function createEp012SideEffectTracker(): Ep012SideEffectTracker {
  return { providerCalls: 0, sceneryReads: 0, r2Gets: 0, dialogueWrites: 0 };
}

export function createThrowingEp012ProviderTransport(tracker: Ep012SideEffectTracker) {
  return async () => {
    tracker.providerCalls += 1;
    throw new Error('EP012_PROVIDER_TRANSPORT_MUST_NOT_BE_CALLED');
  };
}

export function ep012CharacterIdForSpeaker(speaker: string): RegisteredCharacterId {
  if (speaker === 'PIP') return PIP_CHARACTER_ID;
  if (speaker === 'GOAT') return GOAT_CHARACTER_ID;
  throw new VoiceProductionError('Only Pip and Goat are accepted as speakers.', 'UNKNOWN_CHARACTER');
}

export function deriveEp012RequestId(segmentSha256: string): string {
  return `ep012_voice_${segmentSha256.slice(0, 24)}`;
}

export function deriveEp012AuthorizedRequest(segmentId: string): Ep012DerivedVoiceRequest {
  const authorized = getEp012AuthorizedVoiceRequest(segmentId);
  return {
    requestId: authorized.requestId,
    episodeId: authorized.episodeId,
    dialogueRef: authorized.dialogueRef,
    segmentId: authorized.segmentId,
    speaker: authorized.speaker,
    characterId: ep012CharacterIdForSpeaker(authorized.speaker),
    canonicalText: authorized.canonicalText,
    characterCount: authorized.characterCount,
    textSha256: authorized.textSha256,
    segmentSha256: authorized.segmentSha256,
    dialogueSha256: authorized.dialogueSha256,
  };
}

function unique(blockers: Ep012BlockerCode[]): Ep012BlockerCode[] {
  return [...new Set(blockers)];
}

function ledgerStatusOf(entry: DurableLedgerEntry | null): Ep012LedgerEntryStatus {
  if (!entry) return 'ABSENT';
  if (entry.status === 'succeeded') return 'SUCCEEDED';
  if (entry.status === 'reserved') return 'RESERVED';
  if (entry.status === 'failed') return 'FAILED';
  if (entry.status === 'unfinalized') return 'UNFINALIZED';
  return 'ABSENT';
}

function applyDerivedOverrides(
  derived: Ep012DerivedVoiceRequest,
  overrides?: Ep012IntegrityOverrides,
): Ep012DerivedVoiceRequest {
  if (!overrides) return derived;
  return {
    ...derived,
    canonicalText: overrides.canonicalText ?? derived.canonicalText,
    textSha256: overrides.textSha256 ?? derived.textSha256,
    segmentSha256: overrides.segmentSha256 ?? derived.segmentSha256,
    requestId: overrides.requestId ?? derived.requestId,
    speaker: (overrides.speaker as Ep012DerivedVoiceRequest['speaker']) ?? derived.speaker,
    characterId: (overrides.characterId as RegisteredCharacterId) ?? derived.characterId,
    characterCount: overrides.characterCount ?? derived.characterCount,
    dialogueSha256: overrides.dialogueSha256 ?? derived.dialogueSha256,
  };
}

export function evaluateEp012RequestIntegrity(
  segmentId: string,
  entry: DurableLedgerEntry | null,
  overrides?: Ep012IntegrityOverrides,
): Ep012RequestCheck {
  const blockers: Ep012BlockerCode[] = [];
  let derived: Ep012DerivedVoiceRequest | null = null;
  let authorized: Ep012AuthorizedVoiceRequest | null = null;

  try {
    authorized = getEp012AuthorizedVoiceRequest(segmentId);
    derived = applyDerivedOverrides(deriveEp012AuthorizedRequest(segmentId), overrides);
  } catch {
    blockers.push(EP012_BLOCKER_CODES.EP012_SEGMENT_NOT_AUTHORIZED);
  }

  if (derived && authorized) {
    if (
      derived.requestId !== authorized.requestId ||
      derived.requestId !== deriveEp012RequestId(authorized.segmentSha256)
    ) {
      blockers.push(EP012_BLOCKER_CODES.EP012_REQUEST_ID_MISMATCH);
    }
    if (derived.dialogueRef !== authorized.dialogueRef) {
      blockers.push(EP012_BLOCKER_CODES.EP012_DIALOGUE_REF_MISMATCH);
    }
    if (derived.speaker !== authorized.speaker) {
      blockers.push(EP012_BLOCKER_CODES.EP012_SPEAKER_MISMATCH);
    }
    const expectedCharacterId = ep012CharacterIdForSpeaker(authorized.speaker);
    if (derived.characterId !== expectedCharacterId) {
      blockers.push(EP012_BLOCKER_CODES.EP012_CHARACTER_BINDING_MISMATCH);
    }
    speakerFromCharacterId(expectedCharacterId);
    if (derived.canonicalText !== authorized.canonicalText) {
      blockers.push(EP012_BLOCKER_CODES.EP012_TEXT_MISMATCH);
    }
    if (derived.characterCount !== authorized.characterCount) {
      blockers.push(EP012_BLOCKER_CODES.EP012_CHARACTER_COUNT_MISMATCH);
    }
    if (derived.textSha256 !== authorized.textSha256) {
      blockers.push(EP012_BLOCKER_CODES.EP012_TEXT_HASH_MISMATCH);
    }
    if (derived.segmentSha256 !== authorized.segmentSha256) {
      blockers.push(EP012_BLOCKER_CODES.EP012_SEGMENT_HASH_MISMATCH);
    }
    if (
      derived.dialogueSha256 !== authorized.dialogueSha256 ||
      derived.dialogueSha256 !== EP012_REQUIRED_DIALOGUE_SHA256
    ) {
      blockers.push(EP012_BLOCKER_CODES.EP012_DIALOGUE_HASH_MISMATCH);
    }
  }

  const ledgerEntryStatus = ledgerStatusOf(entry);
  if (ledgerEntryStatus === 'RESERVED') blockers.push(EP012_BLOCKER_CODES.EP012_REQUEST_ALREADY_RESERVED);
  if (ledgerEntryStatus === 'FAILED') blockers.push(EP012_BLOCKER_CODES.EP012_REQUEST_FAILED_REQUIRES_REVIEW);
  if (ledgerEntryStatus === 'UNFINALIZED') {
    blockers.push(EP012_BLOCKER_CODES.EP012_REQUEST_UNFINALIZED_REQUIRES_REVIEW);
  }

  const uniqueBlockers = unique(blockers);
  const eligibility: Ep012RequestEligibility =
    uniqueBlockers.length > 0 ? 'BLOCKED' : ledgerEntryStatus === 'SUCCEEDED' ? 'ALREADY_SUCCEEDED' : 'ELIGIBLE';

  return {
    segmentId,
    requestId: derived?.requestId ?? '',
    episodeId: 'EP012',
    dialogueRef: derived?.dialogueRef ?? '',
    speaker: derived?.speaker ?? '',
    characterId: derived?.characterId ?? '',
    characterCount: derived?.characterCount ?? 0,
    textSha256: derived?.textSha256 ?? '',
    segmentSha256: derived?.segmentSha256 ?? '',
    dialogueSha256: derived?.dialogueSha256 ?? '',
    ledgerEntryStatus,
    eligibility,
    passed: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
  };
}

export type Ep012PreflightInput = {
  env?: VoiceEnv;
  store?: DurableVoiceLedgerStore;
  overrides?: Ep012IntegrityOverrides;
  tracker?: Ep012SideEffectTracker;
  now?: Date;
};

export async function runEp012NoProviderPreflight(input: Ep012PreflightInput = {}): Promise<Ep012NoProviderPreflight> {
  const env = input.env ?? process.env;
  const tracker = input.tracker ?? createEp012SideEffectTracker();
  void tracker;
  const blockers: Ep012BlockerCode[] = [];
  const productionRuntime = isProductionVoiceRuntime(env);
  const previewOnlyRuntime = isPreviewOnlyVoiceRuntime(env);
  const previewRuntime = previewOnlyRuntime;
  if (productionRuntime) blockers.push(EP012_BLOCKER_CODES.EP012_PRODUCTION_RUNTIME_REFUSED);
  if (!previewOnlyRuntime) blockers.push(EP012_BLOCKER_CODES.EP012_PREVIEW_RUNTIME_REQUIRED);

  const paidVoiceGenerationEnabled = isPaidVoiceGenerationEnabled(env);
  if (!paidVoiceGenerationEnabled) blockers.push(EP012_BLOCKER_CODES.EP012_PAID_VOICE_DISABLED);

  const paidAuthorizationConvention = isCanonicalPaidVoiceAuthorization(env);
  if (!paidAuthorizationConvention) blockers.push(EP012_BLOCKER_CODES.EP012_PAID_AUTH_CONVENTION_MISMATCH);

  const elevenLabsApiKeyConfigured = hasElevenLabsApiKey(env);
  if (!elevenLabsApiKeyConfigured) blockers.push(EP012_BLOCKER_CODES.EP012_API_KEY_NOT_CONFIGURED);

  const voiceTestTokenConfigured = testTokenConfigured(env);
  if (!voiceTestTokenConfigured) blockers.push(EP012_BLOCKER_CODES.EP012_TEST_TOKEN_NOT_CONFIGURED);

  const voiceTestMaxCharactersGate = voiceTestMaxCharactersGateOpen(env);
  if (!voiceTestMaxCharactersGate) blockers.push(EP012_BLOCKER_CODES.EP012_CHARACTER_GATE_CLOSED);

  let dialogueVerified = false;
  try {
    if (input.overrides?.dialogueLockInvalid) throw new Error('EP012_DIALOGUE_LOCK_INVALID');
    verifyEp012CanonicalDialogueLock();
    dialogueVerified = true;
  } catch {
    blockers.push(EP012_BLOCKER_CODES.EP012_DIALOGUE_LOCK_INVALID);
  }

  const observedDialogueSha =
    input.overrides?.dialogueSha256 ??
    EP012_CANONICAL_DIALOGUE_LOCK.dialogueSha256;
  if (
    observedDialogueSha !== EP012_REQUIRED_DIALOGUE_SHA256 ||
    EP012_CANONICAL_DIALOGUE_SHA256 !== EP012_REQUIRED_DIALOGUE_SHA256 ||
    EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256 !== EP012_REQUIRED_DIALOGUE_SHA256
  ) {
    blockers.push(EP012_BLOCKER_CODES.EP012_DIALOGUE_HASH_MISMATCH);
  }

  let authorizationVerified = false;
  try {
    if (input.overrides?.authorizationInvalid) throw new Error('EP012_AUTHORIZATION_INVALID');
    verifyEp012VoiceAuthorization();
    authorizationVerified = true;
  } catch {
    blockers.push(EP012_BLOCKER_CODES.EP012_AUTHORIZATION_INVALID);
  }

  const observedAuthorizationSha = input.overrides?.authorizationSha256 ?? EP012_VOICE_AUTHORIZATION_SHA256;
  if (observedAuthorizationSha !== EP012_VOICE_AUTHORIZATION.authorizationSha256) {
    blockers.push(EP012_BLOCKER_CODES.EP012_AUTHORIZATION_HASH_MISMATCH);
  }

  const authorizedSegmentCount =
    input.overrides?.authorizedSegmentCount ?? EP012_VOICE_AUTHORIZATION.authorizedSegmentCount;
  if (authorizedSegmentCount !== 11) {
    blockers.push(EP012_BLOCKER_CODES.EP012_AUTHORIZED_COUNT_MISMATCH);
  }

  const totalCharacterCount = input.overrides?.totalCharacterCount ?? EP012_VOICE_AUTHORIZATION.totalCharacterCount;
  if (totalCharacterCount !== 460) {
    blockers.push(EP012_BLOCKER_CODES.EP012_AUTHORIZED_CHARACTER_BUDGET_MISMATCH);
  }

  if (input.overrides?.applyLegacyThreeRequestAllowance) {
    blockers.push(EP012_BLOCKER_CODES.EP012_LEGACY_ALLOWANCE_STILL_ACTIVE);
  }

  const configured = isDurableLedgerConfigured(env);
  if (!configured) blockers.push(EP012_BLOCKER_CODES.EP012_LEDGER_NOT_CONFIGURED);

  const store = input.store ?? resolvePreviewVoiceLedgerStore(env);
  const record = await store.read();
  if (!record.available) blockers.push(EP012_BLOCKER_CODES.EP012_LEDGER_UNAVAILABLE);
  if (!record.reconciled) blockers.push(EP012_BLOCKER_CODES.EP012_LEDGER_RECONCILIATION_REQUIRED);

  const authoritative =
    input.overrides?.forceLedgerAuthoritative === false
      ? false
      : configured && record.available && record.reconciled && store.kind !== 'unavailable';
  if (!authoritative) blockers.push(EP012_BLOCKER_CODES.EP012_LEDGER_NOT_AUTHORITATIVE);
  if (record.reservedRequests > 0) blockers.push(EP012_BLOCKER_CODES.EP012_LEDGER_RESERVED_REQUEST_PRESENT);
  if (record.unfinalizedCount > 0) blockers.push(EP012_BLOCKER_CODES.EP012_LEDGER_UNFINALIZED_REQUEST_PRESENT);

  const authorizedRequests = EP012_VOICE_AUTHORIZATION.authorizedRequests;
  const requestChecks: Ep012RequestCheck[] = [];
  let ep012SucceededRequests = 0;
  let ep012SucceededCharacters = 0;

  for (const authorized of authorizedRequests) {
    const entry = await store.getEntry(authorized.requestId);
    const check = evaluateEp012RequestIntegrity(authorized.segmentId, entry, input.overrides);
    if (check.ledgerEntryStatus === 'SUCCEEDED') {
      ep012SucceededRequests += 1;
      ep012SucceededCharacters += authorized.characterCount;
    }
    requestChecks.push(check);
  }

  let executions: Awaited<ReturnType<DurableVoiceLedgerStore['listEp012Executions']>> = [];
  try {
    executions = await store.listEp012Executions();
  } catch {
    executions = [];
  }
  const storageVerifiedCount = executions.filter((item) => item.storageVerified && item.status === 'succeeded').length;
  const providerRequestsMade = executions.filter((item) => Boolean(item.providerAttemptedAt) || item.status === 'succeeded').length;
  const recoveryRequired = executions.filter(
    (item) => item.status === 'unfinalized' || item.status === 'provider_attempted',
  ).length;
  const ep012RemainingRequests = 11 - ep012SucceededRequests;
  const ep012RemainingCharacters = 460 - ep012SucceededCharacters;
  const passedRequestChecks = requestChecks.filter((item) => item.passed).length;
  const blockedRequestChecks = requestChecks.filter((item) => !item.passed).length;
  for (const check of requestChecks) blockers.push(...check.blockers);

  const serverGates = {
    previewRuntime,
    previewOnlyRuntime,
    productionRuntime,
    paidVoiceGenerationEnabled,
    paidAuthorizationConvention,
    elevenLabsApiKeyConfigured,
    voiceTestTokenConfigured,
    voiceTestMaxCharactersGate,
    sameOriginEnforced: true,
    allPassed:
      previewOnlyRuntime &&
      !productionRuntime &&
      paidVoiceGenerationEnabled &&
      paidAuthorizationConvention &&
      elevenLabsApiKeyConfigured &&
      voiceTestTokenConfigured &&
      voiceTestMaxCharactersGate,
  };

  const ledgerAllPassed =
    configured &&
    record.available &&
    record.reconciled &&
    authoritative &&
    record.reservedRequests === 0 &&
    record.unfinalizedCount === 0;

  const authorizationAllPassed =
    dialogueVerified &&
    authorizationVerified &&
    authorizedSegmentCount === 11 &&
    totalCharacterCount === 460 &&
    observedDialogueSha === EP012_REQUIRED_DIALOGUE_SHA256 &&
    observedAuthorizationSha === EP012_VOICE_AUTHORIZATION.authorizationSha256 &&
    !input.overrides?.applyLegacyThreeRequestAllowance;

  const uniqueBlockers = unique(blockers);
  const complete =
    uniqueBlockers.length === 0 &&
    ep012SucceededRequests === 11 &&
    ep012SucceededCharacters === 460 &&
    record.paidRequests === EP012_FINAL_GLOBAL_REQUEST_CEILING &&
    record.paidCharactersUsed === EP012_FINAL_GLOBAL_CHARACTER_CEILING &&
    record.reservedRequests === 0 &&
    record.unfinalizedCount === 0 &&
    recoveryRequired === 0 &&
    storageVerifiedCount === 11 &&
    providerRequestsMade === 11;
  const ready =
    !complete &&
    uniqueBlockers.length === 0 &&
    serverGates.allPassed &&
    ledgerAllPassed &&
    authorizationAllPassed &&
    blockedRequestChecks === 0 &&
    requestChecks.length === 11;
  const nextProviderContactPermitted = ready && ep012RemainingRequests > 0;

  return {
    schemaVersion: EP012_NO_PROVIDER_PREFLIGHT_SCHEMA,
    ok: ready || complete,
    status: complete ? 'COMPLETE' : ready ? 'READY' : 'BLOCKED',
    episodeId: 'EP012',
    title: 'The Bakery Map',
    dialogueSha256: EP012_REQUIRED_DIALOGUE_SHA256,
    authorizationSha256: EP012_VOICE_AUTHORIZATION.authorizationSha256,
    checkedAt: (input.now ?? new Date()).toISOString(),
    serverGates,
    ledger: {
      configured,
      available: record.available,
      reconciled: record.reconciled,
      authoritative,
      month: record.month,
      globalPaidRequests: record.paidRequests,
      globalPaidCharactersUsed: record.paidCharactersUsed,
      failedAttempts: record.failedAttempts,
      reservedRequests: record.reservedRequests,
      reservedCharacters: record.reservedCharacters,
      unfinalizedCount: record.unfinalizedCount,
      reservations: record.reservedRequests,
      unfinalized: record.unfinalizedCount,
      recoveryRequired,
      ep012SucceededRequests,
      ep012SucceededCharacters,
      ep012RemainingRequests,
      ep012RemainingCharacters,
      authorizedRequests: 11,
      authorizedCharacters: 460,
      completedRequests: ep012SucceededRequests,
      completedCharacters: ep012SucceededCharacters,
      remainingRequests: ep012RemainingRequests,
      remainingCharacters: ep012RemainingCharacters,
      expectedFinalGlobalRequests: 15,
      expectedFinalGlobalCharacters: 695,
      providerRequestsMade,
      storageVerifiedCount,
      allArtifactsStorageVerified: storageVerifiedCount === 11,
      nextProviderContactPermitted,
      allPassed: ledgerAllPassed,
    },
    authorization: {
      issued: EP012_VOICE_AUTHORIZATION.authorizationStatus === 'ISSUED',
      verified: authorizationVerified,
      authorizedSegmentCount: EP012_VOICE_AUTHORIZATION.authorizedSegmentCount,
      maxProviderRequests: EP012_VOICE_AUTHORIZATION.maxProviderRequests,
      pipCharacterCount: EP012_VOICE_AUTHORIZATION.pipCharacterCount,
      goatCharacterCount: EP012_VOICE_AUTHORIZATION.goatCharacterCount,
      totalCharacterCount: EP012_VOICE_AUTHORIZATION.totalCharacterCount,
      oneRequestPerSpeaker: true,
      automaticRetryAllowed: false,
      legacyThreeRequestAllowanceAppliedToEp012: false,
      dialogueLockMutationAllowed: false,
      sceneryAccessAllowed: false,
      allPassed: authorizationAllPassed,
    },
    requestChecks,
    totalRequestChecks: 11,
    passedRequestChecks,
    blockedRequestChecks,
    blockers: uniqueBlockers,
    readyForProviderContact: nextProviderContactPermitted,
    nextProviderContactPermitted,
    providerContacted: false,
    providerRequestsMade,
    sceneryAccessed: false,
    sceneryRequestsMade: 0,
    commercialBytesDownloaded: 0,
    dialogueLockMutated: false,
    productionEnabled: false,
  };
}
