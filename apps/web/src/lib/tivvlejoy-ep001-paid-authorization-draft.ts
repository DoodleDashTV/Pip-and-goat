import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { validatePaidAuthorizationArrival } from '@/lib/tivvlejoy-ep001-external-arrival-validators';

export const EP001_PAID_AUTHORIZATION_DRAFT_SCHEMA = 'TIVVLEJOY_EP001_PAID_AUTHORIZATION_DRAFT_V1' as const;

export function prepareEp001PaidAuthorizationDraft(input: {
  authorizationId: string;
  scope: 'EP001_VOICE_GENERATION' | 'EP001_FINAL_RENDER';
  costCeilingUsd: number;
  expiresAtIso?: string;
  oneShot?: boolean;
  note?: string;
}, now = new Date()) {
  const receiptBody = {
    schemaVersion: 'TIVVLEJOY_EP001_PAID_AUTHORIZATION_METADATA_V1',
    episodeId: 'EP001' as const,
    authorizationId: input.authorizationId.trim(),
    scope: input.scope,
    costCeilingUsd: input.costCeilingUsd,
    expiresAtIso: input.expiresAtIso?.trim() || undefined,
    oneShot: input.oneShot === true,
    note: input.note?.trim() || '',
  };
  const authorizationReceiptSha256 = sha256Canonical(receiptBody);
  const candidate = { ...receiptBody, authorizationReceiptSha256 };
  const validation = validatePaidAuthorizationArrival(candidate, now);
  return {
    schemaVersion: EP001_PAID_AUTHORIZATION_DRAFT_SCHEMA,
    episodeId: 'EP001' as const,
    candidate,
    validation,
    state: validation.valid ? 'STRUCTURALLY_VALID_DRAFT_ONLY' as const : 'INVALID_DRAFT' as const,
    explicitAuthorizationRecorded: false as const,
    authority: {
      paidExecutionAuthorized: false as const,
      providerCallAuthorized: false as const,
      gpuLaunchAuthorized: false as const,
      productionWritesAllowed: false as const,
    },
  };
}
