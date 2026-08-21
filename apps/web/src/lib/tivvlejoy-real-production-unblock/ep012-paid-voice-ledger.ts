import {
  EP012_AUTHORIZED_CHARACTER_COUNT,
  EP012_AUTHORIZED_REQUEST_COUNT,
  EP012_FINAL_GLOBAL_CHARACTER_CEILING,
  EP012_FINAL_GLOBAL_REQUEST_CEILING,
  isEp012RequestId,
} from './ep012-paid-voice-constants';
import { EP012_VOICE_AUTHORIZATION } from './ep012-voice-authorization';
import type { DurableLedgerEntry, DurableSpeaker } from '@/lib/voice-production/durable-voice-ledger';

export type Ep012ExecutionStatus = 'reserved' | 'provider_attempted' | 'succeeded' | 'failed' | 'unfinalized';

export type Ep012ExecutionRecord = {
  requestId: string;
  segmentId: string;
  character: DurableSpeaker;
  characterCount: number;
  status: Ep012ExecutionStatus;
  providerAttemptedAt: string | null;
  audioSha256: string | null;
  audioBytes: number | null;
  storageVerified: boolean;
  audioObjectKey: string | null;
  receiptObjectKey: string | null;
  receiptRef: string | null;
  alignmentPresent: boolean;
  deploymentId: string;
  createdAt: string;
  updatedAt: string;
};

export type Ep012FinalizedReplay = {
  requestId: string;
  segmentId: string;
  receiptRef: string;
  character: DurableSpeaker;
  characterCount: number;
  audioSha256: string;
  audioBytes: number;
  storageVerified: true;
  createdAt: string;
  deploymentId: string;
};

export type Ep012ReserveInput = {
  requestId: string;
  segmentId: string;
  character: DurableSpeaker;
  characterCount: number;
  deploymentId?: string;
};

export type Ep012FinalizeInput = {
  requestId: string;
  receiptRef: string;
  audioSha256: string;
  audioBytes: number;
  audioObjectKey: string;
  receiptObjectKey: string;
  alignmentPresent: boolean;
  createdAt: string;
};

export function authorizedEp012RequestIds(): Set<string> {
  return new Set(EP012_VOICE_AUTHORIZATION.authorizedRequests.map((item) => item.requestId));
}

export function authorizedEp012SegmentCharacterCount(segmentId: string): number | null {
  const authorized = EP012_VOICE_AUTHORIZATION.authorizedRequests.find((item) => item.segmentId === segmentId);
  return authorized ? authorized.characterCount : null;
}

export function assertEp012ReservationIdentity(input: Ep012ReserveInput): void {
  const authorized = EP012_VOICE_AUTHORIZATION.authorizedRequests.find((item) => item.segmentId === input.segmentId);
  if (!authorized || authorized.requestId !== input.requestId || !isEp012RequestId(input.requestId)) {
    throw new Error('EP012_SEGMENT_NOT_AUTHORIZED');
  }
  if (authorized.characterCount !== input.characterCount) {
    throw new Error('EP012_CHARACTER_COUNT_MISMATCH');
  }
  const expectedSpeaker = authorized.speaker === 'PIP' ? 'pip' : 'goat';
  if (input.character !== expectedSpeaker) {
    throw new Error('EP012_SPEAKER_MISMATCH');
  }
}

export function countEp012Usage(entries: DurableLedgerEntry[]): {
  succeededRequests: number;
  succeededCharacters: number;
  reservedRequests: number;
  reservedCharacters: number;
} {
  const authorizedIds = authorizedEp012RequestIds();
  let succeededRequests = 0;
  let succeededCharacters = 0;
  let reservedRequests = 0;
  let reservedCharacters = 0;
  for (const entry of entries) {
    if (!authorizedIds.has(entry.requestId)) continue;
    if (entry.status === 'succeeded') {
      succeededRequests += 1;
      succeededCharacters += entry.characterCount;
    }
    if (entry.status === 'reserved' || entry.status === 'unfinalized') {
      reservedRequests += 1;
      reservedCharacters += entry.characterCount;
    }
  }
  return { succeededRequests, succeededCharacters, reservedRequests, reservedCharacters };
}

export function ep012Ceilings() {
  return {
    authorizedRequests: EP012_AUTHORIZED_REQUEST_COUNT,
    authorizedCharacters: EP012_AUTHORIZED_CHARACTER_COUNT,
    finalGlobalRequests: EP012_FINAL_GLOBAL_REQUEST_CEILING,
    finalGlobalCharacters: EP012_FINAL_GLOBAL_CHARACTER_CEILING,
  };
}

export function replayFromExecution(execution: Ep012ExecutionRecord): Ep012FinalizedReplay | null {
  if (
    execution.status !== 'succeeded' ||
    !execution.storageVerified ||
    !execution.receiptRef ||
    !execution.audioSha256 ||
    !execution.audioBytes
  ) {
    return null;
  }
  return {
    requestId: execution.requestId,
    segmentId: execution.segmentId,
    receiptRef: execution.receiptRef,
    character: execution.character,
    characterCount: execution.characterCount,
    audioSha256: execution.audioSha256,
    audioBytes: execution.audioBytes,
    storageVerified: true,
    createdAt: execution.createdAt,
    deploymentId: execution.deploymentId,
  };
}
