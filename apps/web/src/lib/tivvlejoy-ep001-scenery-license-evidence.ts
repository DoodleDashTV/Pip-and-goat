import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001SceneryGapClosure } from '@/lib/tivvlejoy-ep001-scenery-gap-closure';
import { compileEp001RealScenerySourceInspection } from '@/lib/tivvlejoy-ep001-real-scenery-source-inspection';

export const EP001_SCENERY_LICENSE_EVIDENCE_SCHEMA = 'TIVVLEJOY_EP001_SCENERY_LICENSE_EVIDENCE_V1' as const;

const PUBLIC_MARKETPLACE_CANDIDATES = [
  {
    sourceId: 'FOREST_TEXTURES_4096_V1',
    marketplace: 'CGTrader',
    productTitle: 'Stylized Pine Forest Nature Kit',
    productId: '4870567',
    publicListingLicenseLabel: 'Royalty Free License',
    publicListingMatch: 'STRONG_STATIC_MATCH_NOT_PURCHASE_PROOF' as const,
    matchBasis: [
      'listing provides 4096 TGA PBR texture maps',
      'listing asset families include rocks, foliage, trunks/leaves, grass, flowers, ferns and shrubs',
      'inspected archive is a 4096 TGA texture payload with matching rock/foliage/trunk/leaf families',
    ],
    publicTermsSummary: 'CGTrader Royalty Free terms permit incorporated commercial moving-image/animation use and prohibit redistribution of the downloaded source product.',
    purchaseReceiptStillRequired: true as const,
    exactPurchaseLicenseStillRequiresHumanReview: true as const,
  },
] as const;

export function compileEp001SceneryLicenseEvidence() {
  const closure = compileEp001SceneryGapClosure();
  const inspected = compileEp001RealScenerySourceInspection();
  const slotSourceIds = closure.slots
    .filter((slot) => slot.capabilityState === 'REAL_SOURCE_CANDIDATE_OBSERVED')
    .flatMap((slot) => slot.closureRef);
  const inspectedSourceIds = inspected.sources.map((source) => source.sourceId);
  const additionalObservedIds = closure.additionalObservedSources.map((source) => source.sourceId);
  const publicCandidateIds = PUBLIC_MARKETPLACE_CANDIDATES.map((candidate) => candidate.sourceId);
  const sourceIds = [...new Set([...slotSourceIds, ...inspectedSourceIds, ...additionalObservedIds, ...publicCandidateIds])].sort();

  const records = sourceIds.map((sourceId) => ({
    sourceId,
    dependencyClass: slotSourceIds.includes(sourceId)
      ? 'ROLE_RESOLVING_SOURCE' as const
      : inspectedSourceIds.includes(sourceId)
        ? 'INSPECTED_SUPPORTING_SOURCE' as const
        : additionalObservedIds.includes(sourceId)
          ? 'ADDITIONAL_INSPECTED_SOURCE' as const
          : 'PUBLIC_MATCH_SUPPORTING_SOURCE' as const,
    publicMarketplaceCandidate: PUBLIC_MARKETPLACE_CANDIDATES.find((candidate) => candidate.sourceId === sourceId) ?? null,
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
    realScenerySourceInspectionSha256: inspected.realScenerySourceInspectionSha256,
    state: 'CAPABILITY_COMPLETE_LICENSE_EVIDENCE_NOT_YET_BOUND' as const,
    publicMarketplaceCandidates: PUBLIC_MARKETPLACE_CANDIDATES,
    records,
    acceptedEvidenceClasses: [
      'marketplace purchase receipt or order record naming the exact product',
      'license text or marketplace license page captured with an immutable SHA-256',
      'seller-issued commercial-use grant tied to the purchased product',
    ],
    rejectionRules: [
      'A filename, archive presence, preview image, public listing match, or purchase claim alone is not license evidence.',
      'A generic marketplace policy that cannot be tied to the exact purchased product is insufficient.',
      'Commercial-use permission must be explicit or unambiguously incorporated by the exact purchase license.',
      'Evidence must identify the product/source and be hash-bound before admission.',
      'Supporting texture, material, sky, and library dependencies require provenance even if they do not independently resolve a geometry role.',
      'Every statically inspected commercial source is represented in this evidence gate; source omission cannot be used to bypass provenance.',
      'No evidence record may grant permission to redistribute source files unless the license explicitly says so.',
      'Human review is required; machine parsing cannot issue the final license approval.',
    ],
    admissionRule: 'A selected purchased source and every supporting commercial dependency it uses may be admitted only after exact product identity, purchase evidence, license evidence, commercial-use permission, immutable evidence hashes, and explicit human review are all present.',
    metrics: {
      sourceRecordCount: records.length,
      staticallyInspectedSourceCount: inspectedSourceIds.length,
      roleResolvingSourceCount: records.filter((record) => record.dependencyClass === 'ROLE_RESOLVING_SOURCE').length,
      supportingDependencyCount: records.filter((record) => record.dependencyClass !== 'ROLE_RESOLVING_SOURCE').length,
      publicMarketplaceCandidateCount: PUBLIC_MARKETPLACE_CANDIDATES.length,
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
