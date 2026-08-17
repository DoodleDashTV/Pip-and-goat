import { DEFAULT_MONTHLY_CHAR_LIMIT, type VoiceUsageLedger } from './types';
import { currentUsageMonth, emptyLedger } from './safety';

let ledger: VoiceUsageLedger = emptyLedger();

export function getPreviewPaidLedger(): VoiceUsageLedger {
  if (ledger.month !== currentUsageMonth()) {
    ledger = emptyLedger();
  }
  return { ...ledger };
}

export function resetPreviewPaidLedger(month = currentUsageMonth()): VoiceUsageLedger {
  ledger = emptyLedger(month);
  return getPreviewPaidLedger();
}

export function recordSuccessfulPaidUsage(characterCount: number): VoiceUsageLedger {
  const current = getPreviewPaidLedger();
  ledger = {
    ...current,
    paidCharactersUsed: current.paidCharactersUsed + characterCount,
    paidRequests: current.paidRequests + 1,
    hardStopped: current.paidCharactersUsed + characterCount >= DEFAULT_MONTHLY_CHAR_LIMIT,
  };
  return getPreviewPaidLedger();
}

export function previewMonthlyCharLimit(): number {
  return DEFAULT_MONTHLY_CHAR_LIMIT;
}
