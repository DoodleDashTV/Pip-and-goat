import { APPROVAL_WORKFLOW_SCHEMA, APPROVED_ENVIRONMENT_ASSET_SCHEMA, type ApprovalState, type LicenseState, type ProvenanceState, type ProductionSemanticRole } from './types';
import { isValidSha256, sha256Canonical } from './hash';
import type { DiscoveredLogicalAsset } from './logical';
import type { CanonicalRecommendation } from './canonical';

export type ApprovalDecisionInput = {
  actorClass: 'HUMAN' | 'SYSTEM' | 'SYNTHETIC';
  decision: Exclude<ApprovalState, 'NOT_REVIEWED' | 'TECHNICALLY_BLOCKED' | 'READY_FOR_VISUAL_REVIEW' | 'VISUAL_REVIEW_REQUIRED'>;
  assetCandidateId: string;
  sourceId: string;
  inspectionSha256: string;
  candidateDependencySha256: string;
  visualEvidenceSha256?: string | null;
  visualRequired: boolean;
  semanticRoles: ProductionSemanticRole[];
  licenseState: LicenseState;
  provenanceState: ProvenanceState;
  canonicalState: CanonicalRecommendation['state'];
  confirm: boolean;
  expectedRevision?: number;
  currentRevision?: number;
};

export type ApprovalReceipt = {
  schemaVersion: typeof APPROVAL_WORKFLOW_SCHEMA;
  approvalReceiptId: string;
  state: ApprovalState;
  assetCandidateId: string;
  sourceId: string;
  inspectionSha256: string;
  candidateDependencySha256: string;
  visualEvidenceSha256: string | null;
  semanticRoles: ProductionSemanticRole[];
  licenseState: LicenseState;
  provenanceState: ProvenanceState;
  canonicalState: CanonicalRecommendation['state'];
  actorClass: ApprovalDecisionInput['actorClass'];
  syntheticLabeled: boolean;
  issued: boolean;
  reason: string;
  approvalSha256: string;
};

export function evaluateTechnicalApprovalState(input: {
  blockers: readonly string[];
  visualRequired: boolean;
  visualSatisfied: boolean;
}): ApprovalState {
  if (input.blockers.length) return 'TECHNICALLY_BLOCKED';
  if (input.visualRequired && !input.visualSatisfied) return 'READY_FOR_VISUAL_REVIEW';
  if (input.visualRequired) return 'VISUAL_REVIEW_REQUIRED';
  return 'NOT_REVIEWED';
}

export function issueHumanApproval(input: ApprovalDecisionInput): ApprovalReceipt {
  const syntheticLabeled = input.actorClass === 'SYNTHETIC';
  const reasons: string[] = [];
  if (input.actorClass === 'SYSTEM') reasons.push('Synthetic/system code cannot issue human approval.');
  if (!input.confirm) reasons.push('Explicit confirmation is required.');
  if (!isValidSha256(input.inspectionSha256)) reasons.push('inspectionSha256 is required.');
  if (!isValidSha256(input.candidateDependencySha256)) reasons.push('candidateDependencySha256 is required.');
  if (input.visualRequired && !isValidSha256(input.visualEvidenceSha256)) {
    reasons.push('visualEvidenceSha256 is required for hero/visual review.');
  }
  if (input.licenseState === 'LICENSE_BLOCKED') reasons.push('LICENSE_BLOCKED');
  if (input.provenanceState === 'PROVENANCE_UNKNOWN') reasons.push('PROVENANCE_BLOCKED');
  if (
    input.expectedRevision != null &&
    input.currentRevision != null &&
    input.expectedRevision !== input.currentRevision
  ) {
    reasons.push('WRITE_CONFLICT');
  }
  const issued = reasons.length === 0 && input.actorClass === 'HUMAN';
  const state: ApprovalState = issued ? input.decision : 'NOT_REVIEWED';
  const draft = {
    schemaVersion: APPROVAL_WORKFLOW_SCHEMA,
    approvalReceiptId: `appr:${input.assetCandidateId}:${input.inspectionSha256.slice(0, 12)}`,
    state,
    assetCandidateId: input.assetCandidateId,
    sourceId: input.sourceId,
    inspectionSha256: input.inspectionSha256,
    candidateDependencySha256: input.candidateDependencySha256,
    visualEvidenceSha256: input.visualEvidenceSha256 ?? null,
    semanticRoles: input.semanticRoles,
    licenseState: input.licenseState,
    provenanceState: input.provenanceState,
    canonicalState: input.canonicalState,
    actorClass: input.actorClass,
    syntheticLabeled,
    issued,
    reason: issued ? 'human approval recorded' : reasons.join(' '),
  };
  return { ...draft, approvalSha256: sha256Canonical(draft) };
}

export function promoteApprovedChild(input: {
  child: DiscoveredLogicalAsset;
  approval: ApprovalReceipt;
  inspectionSha256: string;
  sourceReceiptRef: string;
  roles: ProductionSemanticRole[];
  archetypes: string[];
  quality: Array<'HERO' | 'SUPPORTING' | 'BACKGROUND'>;
  depth: Array<'FOREGROUND' | 'MIDGROUND' | 'BACKGROUND'>;
  canonical: CanonicalRecommendation;
}): {
  schemaVersion: typeof APPROVED_ENVIRONMENT_ASSET_SCHEMA;
  assetId: string;
  assetVersion: string;
  sourceId: string;
  sourceReceiptRef: string;
  sourceSha256: string | null;
  inspectionReceiptRef: string;
  inspectionSha256: string;
  approvalReceiptRef: string;
  approvalSha256: string;
  semanticRoles: ProductionSemanticRole[];
  archetypeCompatibility: string[];
  qualityEligibility: Array<'HERO' | 'SUPPORTING' | 'BACKGROUND'>;
  depthEligibility: Array<'FOREGROUND' | 'MIDGROUND' | 'BACKGROUND'>;
  canonicalGroupId: string;
  canonicalState: CanonicalRecommendation['state'];
  worldBuilderEligible: boolean;
  shotAssemblyEligible: boolean;
  assetDependencySha256: string;
  storeOnlyMutated: false;
} | null {
  if (!input.approval.issued || input.approval.state !== 'APPROVED') return null;
  if (input.approval.inspectionSha256 !== input.inspectionSha256) return null;
  if (input.approval.candidateDependencySha256 !== input.child.candidateDependencySha256) return null;
  const assetId = `env:${input.child.assetCandidateId}`;
  const assetVersion = 'v1';
  const draft = {
    schemaVersion: APPROVED_ENVIRONMENT_ASSET_SCHEMA,
    assetId,
    assetVersion,
    sourceId: input.child.sourceId,
    sourceReceiptRef: input.sourceReceiptRef,
    sourceSha256: input.child.sourceSha256,
    inspectionReceiptRef: `insp:${input.inspectionSha256}`,
    inspectionSha256: input.inspectionSha256,
    approvalReceiptRef: input.approval.approvalReceiptId,
    approvalSha256: input.approval.approvalSha256,
    semanticRoles: input.roles,
    archetypeCompatibility: input.archetypes,
    qualityEligibility: input.quality,
    depthEligibility: input.depth,
    canonicalGroupId: input.canonical.groupId,
    canonicalState: input.canonical.state,
    worldBuilderEligible: input.canonical.state !== 'DUPLICATE' && input.canonical.state !== 'ARCHIVAL',
    shotAssemblyEligible: input.canonical.state !== 'DUPLICATE' && input.canonical.state !== 'ARCHIVAL',
    storeOnlyMutated: false as const,
  };
  return { ...draft, assetDependencySha256: sha256Canonical(draft) };
}
