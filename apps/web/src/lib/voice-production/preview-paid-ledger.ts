import type { VoiceUsageLedger } from './types';
import { currentUsageMonth, emptyLedger } from './safety';
import {
  SCRIPT_TO_VOICE_MAX_CHARS,
  SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
  SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
} from './script-line';
import { VoiceProductionError } from './types';

export type SafeVoiceAttempt = {
  requestId: string;
  characterId: string;
  outcome: 'success' | 'failed';
  code: string;
  at: string;
  providerContacted: boolean;
};

let ledger: VoiceUsageLedger = emptyLedger();
let attempts: SafeVoiceAttempt[] = [];

export function getPreviewPaidLedger(): VoiceUsageLedger {
  if (ledger.month !== currentUsageMonth()) {
    ledger = emptyLedger();
    attempts = [];
  }
  return { ...ledger };
}

export function resetPreviewPaidLedger(month = currentUsageMonth()): VoiceUsageLedger {
  ledger = emptyLedger(month);
  attempts = [];
  return getPreviewPaidLedger();
}

export function publicPreviewVoiceAllowance() {
  const current = getPreviewPaidLedger();
  return {
    paidCharactersUsed: current.paidCharactersUsed,
    paidRequests: current.paidRequests,
    failedAttempts: attempts.filter((item) => item.outcome === 'failed').length,
    remainingRequests: Math.max(0, SCRIPT_TO_VOICE_MAX_PAID_REQUESTS - current.paidRequests),
    remainingCharacters: Math.max(0, SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS - current.paidCharactersUsed),
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
  const current = getPreviewPaidLedger();
  if (current.paidRequests >= SCRIPT_TO_VOICE_MAX_PAID_REQUESTS) {
    throw new VoiceProductionError(
      `Temporary Preview allowance of ${SCRIPT_TO_VOICE_MAX_PAID_REQUESTS} successful paid requests is used up.`,
      'PREVIEW_REQUEST_ALLOWANCE',
    );
  }
  if (current.paidCharactersUsed + characterCount > SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS) {
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
  const current = getPreviewPaidLedger();
  ledger = {
    ...current,
    paidCharactersUsed: current.paidCharactersUsed + input.characterCount,
    paidRequests: current.paidRequests + 1,
    hardStopped:
      current.paidRequests + 1 >= SCRIPT_TO_VOICE_MAX_PAID_REQUESTS ||
      current.paidCharactersUsed + input.characterCount >= SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
  };
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
