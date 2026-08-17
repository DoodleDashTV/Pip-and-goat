import type { VoiceUsageLedger } from './types';
import { currentUsageMonth } from './safety';
import {
  SCRIPT_TO_VOICE_MAX_CHARS,
  SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
  SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
} from './script-line';
import { VoiceProductionError } from './types';
import {
  durableRecordToUsageLedger,
  publicDurableLedgerView,
  resetDurableVoiceLedgerForTests,
  resolvePreviewVoiceLedgerStore,
  speakerFromCharacterId,
} from './durable-voice-ledger';

export type SafeVoiceAttempt = {
  requestId: string;
  characterId: string;
  outcome: 'success' | 'failed';
  code: string;
  at: string;
  providerContacted: boolean;
};

let attempts: SafeVoiceAttempt[] = [];

export function getPreviewPaidLedger(): VoiceUsageLedger {
  return durableRecordToUsageLedger(resolvePreviewVoiceLedgerStore().readSync());
}

export function resetPreviewPaidLedger(month = currentUsageMonth()): VoiceUsageLedger {
  void month;
  attempts = [];
  resetDurableVoiceLedgerForTests();
  return getPreviewPaidLedger();
}

export function publicPreviewVoiceAllowance() {
  const view = publicDurableLedgerView();
  const current = getPreviewPaidLedger();
  return {
    paidCharactersUsed: view.authoritative ? (view.paidCharactersUsed ?? 0) : current.paidCharactersUsed,
    paidRequests: view.authoritative ? (view.paidRequests ?? 0) : current.paidRequests,
    failedAttempts: view.failedAttempts ?? 0,
    remainingRequests: view.authoritative
      ? (view.remainingRequests ?? 0)
      : Math.max(0, SCRIPT_TO_VOICE_MAX_PAID_REQUESTS - current.paidRequests),
    remainingCharacters: view.authoritative
      ? (view.remainingCharacters ?? 0)
      : Math.max(0, SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS - current.paidCharactersUsed),
    maxRequests: SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
    maxCharacters: SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
    maxCharsPerLine: SCRIPT_TO_VOICE_MAX_CHARS,
  };
}

export function assertPreviewVoiceAllowance(characterCount: number): void {
  if (characterCount > SCRIPT_TO_VOICE_MAX_CHARS) {
    throw new VoiceProductionError(
      `Line exceeds the temporary Preview limit of ${SCRIPT_TO_VOICE_MAX_CHARS} characters.`,
      'REQUEST_LIMIT',
    );
  }
  const record = resolvePreviewVoiceLedgerStore().readSync();
  if (!record.available || !record.reconciled) {
    return;
  }
  if (record.paidRequests >= SCRIPT_TO_VOICE_MAX_PAID_REQUESTS) {
    throw new VoiceProductionError(
      `Temporary Preview allowance of ${SCRIPT_TO_VOICE_MAX_PAID_REQUESTS} successful paid requests is used up.`,
      'PREVIEW_REQUEST_ALLOWANCE',
    );
  }
  if (record.paidCharactersUsed + characterCount > SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS) {
    throw new VoiceProductionError(
      `Temporary Preview allowance of ${SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS} paid characters would be exceeded.`,
      'PREVIEW_CHARACTER_ALLOWANCE',
    );
  }
}

export function recordSuccessfulPaidUsage(input: {
  requestId: string;
  characterId: string;
  characterCount: number;
}): VoiceUsageLedger {
  const store = resolvePreviewVoiceLedgerStore();
  if (!store.seedPaidUsage) {
    throw new VoiceProductionError('Paid generation paused — durable ledger unavailable', 'DURABLE_LEDGER_UNAVAILABLE');
  }
  store.seedPaidUsage({
    requestId: input.requestId,
    character: speakerFromCharacterId(input.characterId),
    characterCount: input.characterCount,
  });
  attempts.push({
    requestId: input.requestId,
    characterId: input.characterId,
    outcome: 'success',
    code: 'PAID_SUCCESS',
    at: new Date().toISOString(),
    providerContacted: true,
  });
  return getPreviewPaidLedger();
}

export function recordFailedVoiceAttempt(input: {
  requestId: string;
  characterId: string;
  code: string;
  providerContacted: boolean;
}): void {
  attempts.push({
    requestId: input.requestId,
    characterId: input.characterId,
    outcome: 'failed',
    code: input.code,
    at: new Date().toISOString(),
    providerContacted: input.providerContacted,
  });
}

export function publicSafeAttempts(): Array<Omit<SafeVoiceAttempt, never>> {
  return attempts.map((item) => ({ ...item }));
}

export function previewMonthlyCharLimit(): number {
  return SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS;
}
