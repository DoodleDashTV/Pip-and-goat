import { VoiceProductionError } from '@/lib/voice-production/types';

export const EP012_EXECUTION_LEDGER_UNAVAILABLE_CODE = 'EP012_EXECUTION_LEDGER_UNAVAILABLE' as const;

export type Ep012ExecutionLedgerFailureClass = 'missing_table' | 'unreachable' | 'unreadable';

const SAFE_EXECUTION_LEDGER_MESSAGE = 'The EP012 execution ledger is unavailable.';

export function classifyEp012ExecutionLedgerFailure(error: unknown): Ep012ExecutionLedgerFailureClass {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (code === 'P2021') return 'missing_table';
  if (code === 'P1001' || code === 'P1002' || code === 'P1017' || code === 'P2024') return 'unreachable';
  return 'unreadable';
}

export function recordSanitizedEp012ExecutionLedgerFailure(error: unknown): void {
  const reason = classifyEp012ExecutionLedgerFailure(error);
  console.warn(`[ep012-execution-ledger] probe_failed reason=${reason}`);
}

export function ep012ExecutionLedgerUnavailableError(): VoiceProductionError {
  return new VoiceProductionError(SAFE_EXECUTION_LEDGER_MESSAGE, EP012_EXECUTION_LEDGER_UNAVAILABLE_CODE);
}

export function isEp012ExecutionLedgerUnavailableError(error: unknown): boolean {
  return error instanceof VoiceProductionError && error.code === EP012_EXECUTION_LEDGER_UNAVAILABLE_CODE;
}

export function wrapEp012ExecutionLedgerQuery<T>(work: () => Promise<T>): Promise<T> {
  return work().catch((error: unknown) => {
    recordSanitizedEp012ExecutionLedgerFailure(error);
    throw ep012ExecutionLedgerUnavailableError();
  });
}
