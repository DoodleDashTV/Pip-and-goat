import type { AssetRenderReceipt, ReadinessBlockedState } from './types';

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function classifyAssetReceipt(
  receipt: AssetRenderReceipt | undefined,
  expected?: { sha256?: string; assetVersion?: string },
): { ok: true } | { ok: false; code: ReadinessBlockedState; reason: string } {
  if (!receipt) {
    return { ok: false, code: 'BLOCKED_ASSET_MISSING', reason: 'Required asset receipt is missing.' };
  }
  if (receipt.quarantined || receipt.approvalStatus === 'quarantined') {
    return { ok: false, code: 'BLOCKED_ASSET_QUARANTINED', reason: `Asset ${receipt.assetId} is quarantined.` };
  }
  if (!receipt.objectKey || !receipt.sha256) {
    return { ok: false, code: 'BLOCKED_ASSET_MISSING', reason: `Asset ${receipt.assetId} has no object key or hash.` };
  }
  if (!SHA256_HEX.test(receipt.sha256) || !receipt.hashVerified || !receipt.sourceVerified) {
    return { ok: false, code: 'BLOCKED_HASH_MISMATCH', reason: `Asset ${receipt.assetId} hash is not verified.` };
  }
  if (expected?.sha256 && expected.sha256 !== receipt.sha256) {
    return { ok: false, code: 'BLOCKED_HASH_MISMATCH', reason: `Asset ${receipt.assetId} SHA-256 does not match.` };
  }
  if (expected?.assetVersion && expected.assetVersion !== receipt.assetVersion) {
    return {
      ok: false,
      code: 'BLOCKED_HASH_MISMATCH',
      reason: `Asset ${receipt.assetId} version is not the locked version.`,
    };
  }
  if (receipt.approvalStatus !== 'approved' && receipt.approvalStatus !== 'fixture_only') {
    return { ok: false, code: 'BLOCKED_ASSET_UNAPPROVED', reason: `Asset ${receipt.assetId} is not approved.` };
  }
  if (receipt.assetRole === 'CHARACTER' || receipt.heroSafe) {
    if (!receipt.heroSafe || receipt.stylizationApproval === 'unapproved') {
      return { ok: false, code: 'BLOCKED_ASSET_UNAPPROVED', reason: `Hero asset ${receipt.assetId} is not hero-safe.` };
    }
  }
  if (!receipt.provenanceValid) {
    return { ok: false, code: 'BLOCKED_ASSET_UNAPPROVED', reason: `Asset ${receipt.assetId} provenance is invalid.` };
  }
  return { ok: true };
}

export function classifyRequiredAssets(
  required: AssetRenderReceipt[],
  present: AssetRenderReceipt[],
): { ok: true; approved: number } | { ok: false; code: ReadinessBlockedState; reason: string } {
  let approved = 0;
  for (const needed of required) {
    const found = present.find((item) => item.assetId === needed.assetId && item.assetVersion === needed.assetVersion);
    const classified = classifyAssetReceipt(found, { sha256: needed.sha256, assetVersion: needed.assetVersion });
    if (!classified.ok) return classified;
    approved += 1;
  }
  if (present.some((item) => item.assetVersion === 'latest' || item.assetVersion === 'newest')) {
    return { ok: false, code: 'BLOCKED_HASH_MISMATCH', reason: 'Asset versions must be exact. latest/newest is refused.' };
  }
  return { ok: true, approved };
}
