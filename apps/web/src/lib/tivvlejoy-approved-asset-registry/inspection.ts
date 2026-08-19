import { sha256Canonical, isValidSha256 } from './hash';
import {
  APPROVAL_RECEIPT_SCHEMA,
  INSPECTION_EVIDENCE_SCHEMA,
  type ApprovalReceipt,
  type InspectionEvidence,
  type QualityTier,
} from './types';

export function inspectionEvidenceHash(evidence: Omit<InspectionEvidence, 'inspectionSha256' | 'schemaVersion'> & {
  schemaVersion?: string;
}): string {
  return sha256Canonical({
    schemaVersion: INSPECTION_EVIDENCE_SCHEMA,
    sourceId: evidence.sourceId,
    sourceReceiptRef: evidence.sourceReceiptRef,
    sourceSha256: evidence.sourceSha256,
    storedByteSize: evidence.storedByteSize,
    expectedByteSize: evidence.expectedByteSize,
    sizeVerified: evidence.sizeVerified,
    inspectionId: evidence.inspectionId,
    containerIntegrity: evidence.containerIntegrity,
    discoveredAssetId: evidence.discoveredAssetId,
    discoveredAssetKind: evidence.discoveredAssetKind,
    nativeFormat: evidence.nativeFormat,
    blenderCompatibility: evidence.blenderCompatibility,
    geometryMetrics: evidence.geometryMetrics,
    materialMetrics: evidence.materialMetrics,
    textureMetrics: evidence.textureMetrics,
    externalDependencies: evidence.externalDependencies,
    requiredAddonDependencies: evidence.requiredAddonDependencies,
    missingTextureRefs: evidence.missingTextureRefs,
    missingExternalRefs: evidence.missingExternalRefs,
    safetyAssessment: evidence.safetyAssessment,
    provenanceState: evidence.provenanceState,
    licenseState: evidence.licenseState,
    visualEvidenceRefs: evidence.visualEvidenceRefs,
    styleFingerprint: evidence.styleFingerprint,
    semanticClassification: evidence.semanticClassification,
    canonicalRecommendation: evidence.canonicalRecommendation,
    inspectionBlockers: evidence.inspectionBlockers,
  });
}

export function approvalReceiptHash(receipt: Omit<ApprovalReceipt, 'approvalSha256' | 'schemaVersion'>): string {
  return sha256Canonical({
    schemaVersion: APPROVAL_RECEIPT_SCHEMA,
    approvalReceiptId: receipt.approvalReceiptId,
    assetId: receipt.assetId,
    assetVersion: receipt.assetVersion,
    sourceId: receipt.sourceId,
    sourceReceiptRef: receipt.sourceReceiptRef,
    sourceSha256: receipt.sourceSha256,
    inspectionReceiptRef: receipt.inspectionReceiptRef,
    inspectionSha256: receipt.inspectionSha256,
    approvalDecision: receipt.approvalDecision,
    approvedSemanticRoles: [...receipt.approvedSemanticRoles].sort(),
    approvedCoverageCategories: [...receipt.approvedCoverageCategories].sort(),
    approvedArchetypes: [...receipt.approvedArchetypes].sort(),
    visualApprovalRequired: receipt.visualApprovalRequired,
    visualApprovalSatisfied: receipt.visualApprovalSatisfied,
    licenseState: receipt.licenseState,
    provenanceState: receipt.provenanceState,
  });
}

export function missingApprovalEvidence(input: {
  evidence: InspectionEvidence | null;
  approval: ApprovalReceipt | null;
  qualityTier?: QualityTier;
}): string[] {
  const missing: string[] = [];
  const evidence = input.evidence;
  if (!evidence) {
    missing.push('inspection evidence');
    return missing;
  }
  if (!evidence.sourceReceiptRef) missing.push('R2/source receipt');
  if (!evidence.sourceId) missing.push('immutable source ID');
  if (!isValidSha256(evidence.sourceSha256)) missing.push('valid source SHA-256');
  if (!evidence.sizeVerified || evidence.storedByteSize !== evidence.expectedByteSize) missing.push('byte-size verification');
  if (evidence.containerIntegrity !== 'PASSED') missing.push('container/source integrity');
  if (!evidence.discoveredAssetId || !evidence.discoveredAssetKind) missing.push('file/object inventory');
  if (!evidence.nativeFormat) missing.push('format classification');
  if (evidence.provenanceState !== 'RESOLVED') missing.push('provenance resolved');
  if (evidence.licenseState !== 'APPROVED_INTERNAL') missing.push('internal commercial-use license');
  const kind = evidence.discoveredAssetKind.toUpperCase();
  const needsGeometry = !['SKY', 'MATERIAL', 'TEXTURE'].includes(kind);
  if (needsGeometry && !evidence.geometryMetrics) missing.push('geometry evidence');
  if (!['SKY'].includes(kind) && !evidence.materialMetrics) missing.push('material evidence');
  if (!evidence.textureMetrics) missing.push('texture evidence');
  if (!Array.isArray(evidence.missingTextureRefs)) missing.push('missing textures evaluated');
  if (!Array.isArray(evidence.externalDependencies) || !Array.isArray(evidence.missingExternalRefs)) {
    missing.push('external dependencies evaluated');
  }
  if (!Array.isArray(evidence.requiredAddonDependencies)) missing.push('addon dependencies evaluated');
  if (
    evidence.safetyAssessment.scripts !== 'SAFE' ||
    evidence.safetyAssessment.network !== 'SAFE' ||
    evidence.safetyAssessment.shell !== 'SAFE'
  ) {
    missing.push('unsafe script/network/shell behavior');
  }
  if (evidence.blenderCompatibility === 'UNKNOWN') missing.push('Blender compatibility evaluated');
  if (!evidence.styleFingerprint) missing.push('style fingerprint');
  if (!evidence.semanticClassification?.roles?.length) missing.push('semantic classification');
  if (!evidence.canonicalRecommendation?.groupId) missing.push('canonical/duplicate decision');
  if (!isValidSha256(evidence.inspectionSha256)) missing.push('inspection receipt hash');
  if (!input.approval) missing.push('approval receipt');
  const hero = input.qualityTier === 'HERO' || evidence.semanticClassification.roles.some((role) => role.endsWith('_HERO') || role === 'BUILDING_HERO' || role === 'MOUNTAIN_HERO');
  if (hero) {
    if (!evidence.visualEvidenceRefs.length) missing.push('visual evidence present');
    if (!input.approval?.visualApprovalSatisfied) missing.push('visual evidence explicitly approved');
  }
  return missing;
}

export function mayApproveAsset(input: {
  evidence: InspectionEvidence;
  approval: ApprovalReceipt;
  qualityTier?: QualityTier;
}): boolean {
  return missingApprovalEvidence(input).length === 0 && input.approval.approvalDecision === 'APPROVED';
}
