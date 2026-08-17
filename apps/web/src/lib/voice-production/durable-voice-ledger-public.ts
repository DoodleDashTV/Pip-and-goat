export const DURABLE_LEDGER_COPY = {
  title: 'Durable Preview voice ledger',
  protected: 'Usage protected across deployments',
  unavailable: 'Paid generation paused — durable ledger unavailable',
  reconcile: 'Paid generation paused — prior usage requires reconciliation',
} as const;

export const PRIOR_PAID_USAGE_KNOWN = true;

export const PRIOR_PAID_USAGE_EVIDENCE =
  'Justin approved newly generated Preview dialogue for both Pip and Goat on August 17, 2026. Those two successful Preview tests were stored only in process memory. No safe receipt, request ID, or character total survived the next Preview deployment.';

export const DURABLE_LEDGER_RECONCILE_PROCEDURE = [
  'Paid generation stays paused until prior usage is imported once.',
  'Read the exact successful request count and billed character totals from ElevenLabs usage for the two approved Preview tests. Do not estimate.',
  'Set Preview-only TIVVLEJOY_VOICE_LEDGER_DURABLE=true.',
  'Set Preview-only TIVVLEJOY_VOICE_LEDGER_DATABASE_URL to a PostgreSQL URL that is not the public website DATABASE_URL.',
  'Apply the Preview voice-ledger migration to that database.',
  'Set TIVVLEJOY_VOICE_LEDGER_RECONCILE_REQUESTS and TIVVLEJOY_VOICE_LEDGER_RECONCILE_CHARACTERS to those exact totals.',
  'Set TIVVLEJOY_VOICE_LEDGER_RECONCILE_EVIDENCE to a short note naming the ElevenLabs usage source.',
  'Do not set zeros. Do not enter the private test token. Do not generate speech to discover the totals.',
].join(' ');

export type DurableLedgerPublicStatus = 'protected' | 'unavailable' | 'reconciliation_required';

export type PublicDurableVoiceLedger = {
  title: typeof DURABLE_LEDGER_COPY.title;
  status: DurableLedgerPublicStatus;
  message: string;
  available: boolean;
  reconciled: boolean;
  generateEnabled: boolean;
  paidRequests: number | null;
  paidCharactersUsed: number | null;
  remainingRequests: number | null;
  remainingCharacters: number | null;
  failedAttempts: number | null;
  authoritative: boolean;
  providerContacted: false;
  productionEnabled: false;
};
