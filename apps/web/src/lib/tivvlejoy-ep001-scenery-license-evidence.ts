import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001SceneryGapClosure } from '@/lib/tivvlejoy-ep001-scenery-gap-closure';

export const EP001_SCENERY_LICENSE_EVIDENCE_SCHEMA = 'TIVVLEJOY_EP001_SCENERY_LICENSE_EVIDENCE_V1' as const;

export function compileEp001SceneryLicenseEvidence() {
  const closure = compileEp001SceneryGapClosure();
  const purchasedSourceIds = [...new Set(
    closure.slots
      .filter((slot) => slot.capabilityState === 'REAL_SOURCE_CANDIDATE_OBSERVED')
      .flatMap((slot) => slot.closureRef),
  )].sort();

  const records = purchasedSourceIds.map((sourceId) => ({
    sourceId,
    evidenceState: 'AWAITING_LICENSE_EVIDENCE' as const,
    sellerOrMarketplace: null,
    productTitle: null,
    orderOrReceiptRef: null,
    purchaseDate: null,
    licenseName: null,
    licenseTextSha256: null,
    receiptSha256: null,
    commercialUseAllowed: null,
    redistributionOfSourceFilesAllowed: null,
    modificationAllowed: null,
    attributionRequired: null,
    evidenceReviewedByHuman: false as const,
    humanReviewReceiptSha256: null,
    admittedForEp001: false as const,
  }));

  const body = {
    schemaVersion: EP001_SCENERY_LICENSE_EVIDENCE_SCHEMA,
    episodeId: closure.episodeId,
    sceneryGapClosureSha256: closure.sceneryGapClosureSha256,
    state: 'CAPABILITY_COMPLETE_LICENSE_EVIDENCE_NOT_YET_BOUND' as const,
    records,
    acceptedEvidenceClasses: [
      'marketplace purchase receipt or order record naming the exact product',
      'license text or marketplace license page captured with an immutable SHA-256',
      'seller-issued commercial-use grant tied to the purchased product',
    ],
    rejectionRules: [
      'A filename, archive presence, preview image, or purchase claim alone is not license evidence.',
      'A generic marketplace policy that cannot be tied to the exact purchased product is insufficient.',
      'Commercial-use permission must be explicit or unambiguously incorporated by the exact purchase license.',
      'Evidence must identify the product/source and be hash-bound before admission.',
      'No evidence record may grant permission to redistribute source files unless the license explicitly says so.',
      'Human review is required; machine parsing cannot issue the final license approval.',
    ],
    admissionRule: 'A selected purchased source may be admitted only after exact product identity, purchase evidence, license evidence, commercial-use permission, immutable evidence hashes, and explicit human review are all present.',
    metrics: {
      purchasedSourceRecordCount: records.length,
      evidenceBoundCount: 0 as const,
      commercialUseVerifiedCount: 0 as const,
      humanReviewedCount: 0 as const,
      admittedCount: 0 as const,
    },
    authority: {
      licensesVerified: false as const,
      sceneryAdmissionGranted: false as const,
      humanLicenseApprovalIssued: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      externalPurchasesMade: 0 as const,
      externalNetworkCallsByCompiler: 0 as const,
      sourceArchivesModified: false as const,
      blenderLaunched: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, sceneryLicenseEvidenceSha256: sha256Canonical(body) };
}

export type Ep001SceneryLicenseEvidence = ReturnType<typeof compileEp001SceneryLicenseEvidence>;
