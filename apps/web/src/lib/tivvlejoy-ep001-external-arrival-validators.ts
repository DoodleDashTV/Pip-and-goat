const SHA256_RE = /^[a-f0-9]{64}$/i;
const MAX_BLEND_BYTES = 384 * 1024 * 1024;

export type RigArrivalCandidate = {
  characterId: 'CHAR_PIP_001' | 'CHAR_GOAT_001';
  filename: string;
  byteSize: number;
  sha256: string;
  artistVersionNote: string;
};

export type SceneryLicenseCandidate = {
  sourceId: string;
  productIdentity: string;
  orderEvidenceRef: string;
  licenseTextOrGrant: string;
  evidenceSha256: string;
};

export type PaidAuthorizationCandidate = {
  authorizationId: string;
  scope: 'EP001_VOICE_GENERATION' | 'EP001_FINAL_RENDER';
  costCeilingUsd: number;
  expiresAtIso?: string;
  oneShot?: boolean;
  authorizationReceiptSha256: string;
};

export type ArrivalValidation = {
  valid: boolean;
  errors: string[];
  authorityGranted: false;
  persisted: false;
};

function result(errors: string[]): ArrivalValidation {
  return { valid: errors.length === 0, errors, authorityGranted: false, persisted: false };
}

export function validateRigArrival(candidate: RigArrivalCandidate): ArrivalValidation {
  const errors: string[] = [];
  if (!candidate.filename.toLowerCase().endsWith('.blend')) errors.push('CANONICAL_BLEND_REQUIRED');
  if (!Number.isInteger(candidate.byteSize) || candidate.byteSize < 1024) errors.push('INVALID_RIG_BYTE_SIZE');
  if (candidate.byteSize > MAX_BLEND_BYTES) errors.push('RIG_EXCEEDS_384_MIB_LIMIT');
  if (!SHA256_RE.test(candidate.sha256)) errors.push('INVALID_RIG_SHA256');
  if (candidate.artistVersionNote.trim().length < 3) errors.push('ARTIST_VERSION_NOTE_REQUIRED');
  return result(errors);
}

export function validateSceneryLicenseArrival(
  candidate: SceneryLicenseCandidate,
): ArrivalValidation {
  const errors: string[] = [];
  if (candidate.sourceId.trim().length === 0) errors.push('SOURCE_ID_REQUIRED');
  if (candidate.productIdentity.trim().length === 0) errors.push('PRODUCT_IDENTITY_REQUIRED');
  if (candidate.orderEvidenceRef.trim().length === 0) errors.push('ORDER_EVIDENCE_REQUIRED');
  if (candidate.licenseTextOrGrant.trim().length < 10) errors.push('LICENSE_TEXT_OR_GRANT_REQUIRED');
  if (!SHA256_RE.test(candidate.evidenceSha256)) errors.push('INVALID_LICENSE_EVIDENCE_SHA256');
  return result(errors);
}

export function validatePaidAuthorizationArrival(
  candidate: PaidAuthorizationCandidate,
  now = new Date(),
): ArrivalValidation {
  const errors: string[] = [];
  if (candidate.authorizationId.trim().length === 0) errors.push('AUTHORIZATION_ID_REQUIRED');
  if (!Number.isFinite(candidate.costCeilingUsd) || candidate.costCeilingUsd <= 0) errors.push('POSITIVE_COST_CEILING_REQUIRED');
  if (!SHA256_RE.test(candidate.authorizationReceiptSha256)) errors.push('INVALID_AUTHORIZATION_RECEIPT_SHA256');

  const hasFutureExpiry = (() => {
    if (!candidate.expiresAtIso) return false;
    const expiryMs = Date.parse(candidate.expiresAtIso);
    return Number.isFinite(expiryMs) && expiryMs > now.getTime();
  })();
  if (!hasFutureExpiry && candidate.oneShot !== true) errors.push('FUTURE_EXPIRY_OR_ONE_SHOT_REQUIRED');

  return result(errors);
}
