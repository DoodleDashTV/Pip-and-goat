import { sha256Canonical } from '@/lib/tivvlejoy-production-studio/hash';
import {
  EP012_CANONICAL_DIALOGUE_LOCK,
  EP012_CANONICAL_DIALOGUE_SHA256,
  verifyEp012CanonicalDialogueLock,
  type Ep012CanonicalSegmentSpeaker,
} from './ep012-canonical-dialogue';

export const EP012_VOICE_AUTHORIZATION_SCHEMA = 'TIVVLEJOY_EP012_VOICE_AUTHORIZATION_V1' as const;
export const EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256 =
  'f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4' as const;

export type Ep012AuthorizedVoiceRequest = {
  requestId: string;
  episodeId: 'EP012';
  dialogueRef: (typeof EP012_CANONICAL_DIALOGUE_LOCK.lines)[number]['dialogueRef'];
  segmentId: string;
  speaker: Ep012CanonicalSegmentSpeaker;
  canonicalText: string;
  characterCount: number;
  textSha256: string;
  segmentSha256: string;
  dialogueSha256: typeof EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256;
  oneRequestPerSpeaker: true;
  automaticRetryAllowed: false;
};

function requestIdFor(segmentSha256: string): string {
  return `ep012_voice_${segmentSha256.slice(0, 24)}`;
}

function countCharacters(text: string): number {
  return Array.from(text).length;
}

function buildAuthorizedRequests(): readonly Ep012AuthorizedVoiceRequest[] {
  return EP012_CANONICAL_DIALOGUE_LOCK.lines.flatMap((line) =>
    line.subsegments.map((segment) => ({
      requestId: requestIdFor(segment.segmentSha256),
      episodeId: 'EP012' as const,
      dialogueRef: line.dialogueRef,
      segmentId: segment.segmentId,
      speaker: segment.speaker,
      canonicalText: segment.canonicalText,
      characterCount: countCharacters(segment.canonicalText),
      textSha256: segment.textSha256,
      segmentSha256: segment.segmentSha256,
      dialogueSha256: EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256,
      oneRequestPerSpeaker: true as const,
      automaticRetryAllowed: false as const,
    })),
  );
}

const authorizedRequests = buildAuthorizedRequests();
const pipCharacterCount = authorizedRequests
  .filter((request) => request.speaker === 'PIP')
  .reduce((sum, request) => sum + request.characterCount, 0);
const goatCharacterCount = authorizedRequests
  .filter((request) => request.speaker === 'GOAT')
  .reduce((sum, request) => sum + request.characterCount, 0);
const totalCharacterCount = pipCharacterCount + goatCharacterCount;

const authorizationCore = {
  schemaVersion: EP012_VOICE_AUTHORIZATION_SCHEMA,
  authorizationStatus: 'ISSUED' as const,
  scope: 'EP012_CANONICAL_SUBSEGMENTS_ONLY' as const,
  episodeId: 'EP012' as const,
  title: 'The Bakery Map' as const,
  dialogueSha256: EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256,
  canonicalLineCount: 7 as const,
  authorizedSegmentCount: 11 as const,
  maxProviderRequests: 11 as const,
  pipCharacterCount,
  goatCharacterCount,
  totalCharacterCount,
  maxPaidCharacters: totalCharacterCount,
  oneRequestPerSpeaker: true as const,
  providerContactAuthorizedWithinScope: true as const,
  automaticRetryAllowed: false as const,
  durableLedgerRequired: true as const,
  existingServerGatesRequired: true as const,
  productionEnabled: false as const,
  dialogueLockMutationAllowed: false as const,
  sceneryAccessAllowed: false as const,
  commercialBytesDownloaded: 0 as const,
  generationPerformed: false as const,
  authorizedRequests,
};

export const EP012_VOICE_AUTHORIZATION_SHA256 = sha256Canonical(authorizationCore);

export const EP012_VOICE_AUTHORIZATION = {
  ...authorizationCore,
  authorizationSha256: EP012_VOICE_AUTHORIZATION_SHA256,
} as const;

export type Ep012VoiceAuthorizationRequestInput = {
  requestId: string;
  episodeId: string;
  dialogueRef: string;
  segmentId: string;
  speaker: string;
  canonicalText: string;
  characterCount: number;
  textSha256: string;
  segmentSha256: string;
  dialogueSha256: string;
};

function findLockedSegment(segmentId: string) {
  for (const line of EP012_CANONICAL_DIALOGUE_LOCK.lines) {
    const segment = line.subsegments.find((item) => item.segmentId === segmentId);
    if (segment) return { line, segment };
  }
  return null;
}

export function verifyEp012VoiceAuthorization(): true {
  verifyEp012CanonicalDialogueLock();
  if (EP012_CANONICAL_DIALOGUE_SHA256 !== EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256) {
    throw new Error('EP012_VOICE_AUTH_DIALOGUE_HASH_MISMATCH');
  }
  if (EP012_CANONICAL_DIALOGUE_LOCK.dialogueSha256 !== EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256) {
    throw new Error('EP012_VOICE_AUTH_LOCK_HASH_MISMATCH');
  }
  if (authorizedRequests.length !== 11 || EP012_CANONICAL_DIALOGUE_LOCK.utteranceSegmentCount !== 11) {
    throw new Error('EP012_VOICE_AUTH_SEGMENT_COUNT_MISMATCH');
  }
  if (totalCharacterCount !== authorizedRequests.reduce((sum, request) => sum + countCharacters(request.canonicalText), 0)) {
    throw new Error('EP012_VOICE_AUTH_CHARACTER_COUNT_MISMATCH');
  }

  const segmentIds = new Set<string>();
  const requestIds = new Set<string>();
  for (const request of authorizedRequests) {
    if (segmentIds.has(request.segmentId)) throw new Error(`EP012_VOICE_AUTH_DUPLICATE_SEGMENT:${request.segmentId}`);
    if (requestIds.has(request.requestId)) throw new Error(`EP012_VOICE_AUTH_DUPLICATE_REQUEST:${request.requestId}`);
    segmentIds.add(request.segmentId);
    requestIds.add(request.requestId);

    const locked = findLockedSegment(request.segmentId);
    if (!locked) throw new Error(`EP012_VOICE_AUTH_UNKNOWN_SEGMENT:${request.segmentId}`);
    if (locked.line.dialogueRef !== request.dialogueRef) {
      throw new Error(`EP012_VOICE_AUTH_DIALOGUE_REF_MISMATCH:${request.segmentId}`);
    }
    if (locked.segment.speaker !== request.speaker) {
      throw new Error(`EP012_VOICE_AUTH_SPEAKER_MISMATCH:${request.segmentId}`);
    }
    if (locked.segment.canonicalText !== request.canonicalText) {
      throw new Error(`EP012_VOICE_AUTH_TEXT_MISMATCH:${request.segmentId}`);
    }
    if (countCharacters(locked.segment.canonicalText) !== request.characterCount) {
      throw new Error(`EP012_VOICE_AUTH_CHARACTER_COUNT_MISMATCH:${request.segmentId}`);
    }
    if (locked.segment.textSha256 !== request.textSha256) {
      throw new Error(`EP012_VOICE_AUTH_TEXT_HASH_MISMATCH:${request.segmentId}`);
    }
    if (locked.segment.segmentSha256 !== request.segmentSha256) {
      throw new Error(`EP012_VOICE_AUTH_SEGMENT_HASH_MISMATCH:${request.segmentId}`);
    }
    if (request.dialogueSha256 !== EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256) {
      throw new Error(`EP012_VOICE_AUTH_AGGREGATE_HASH_MISMATCH:${request.segmentId}`);
    }
    if (request.requestId !== requestIdFor(request.segmentSha256)) {
      throw new Error(`EP012_VOICE_AUTH_REQUEST_ID_MISMATCH:${request.segmentId}`);
    }
  }

  if (sha256Canonical(authorizationCore) !== EP012_VOICE_AUTHORIZATION_SHA256) {
    throw new Error('EP012_VOICE_AUTHORIZATION_HASH_MISMATCH');
  }
  return true;
}

export function assertEp012VoiceRequestAuthorized(input: Ep012VoiceAuthorizationRequestInput): Ep012AuthorizedVoiceRequest {
  verifyEp012VoiceAuthorization();
  if (input.episodeId !== 'EP012') throw new Error('EP012_VOICE_AUTH_WRONG_EPISODE');
  if (input.dialogueSha256 !== EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256) {
    throw new Error('EP012_VOICE_AUTH_DIALOGUE_HASH_MISMATCH');
  }
  const authorized = authorizedRequests.find((item) => item.segmentId === input.segmentId);
  if (!authorized) throw new Error(`EP012_VOICE_AUTH_SEGMENT_NOT_AUTHORIZED:${input.segmentId}`);
  const exact =
    input.requestId === authorized.requestId &&
    input.dialogueRef === authorized.dialogueRef &&
    input.speaker === authorized.speaker &&
    input.canonicalText === authorized.canonicalText &&
    input.characterCount === authorized.characterCount &&
    input.textSha256 === authorized.textSha256 &&
    input.segmentSha256 === authorized.segmentSha256;
  if (!exact) throw new Error(`EP012_VOICE_AUTH_REQUEST_MISMATCH:${input.segmentId}`);
  return authorized;
}

export function getEp012AuthorizedVoiceRequest(segmentId: string): Ep012AuthorizedVoiceRequest {
  verifyEp012VoiceAuthorization();
  const request = authorizedRequests.find((item) => item.segmentId === segmentId);
  if (!request) throw new Error(`EP012_VOICE_AUTH_SEGMENT_NOT_AUTHORIZED:${segmentId}`);
  return request;
}

verifyEp012VoiceAuthorization();
