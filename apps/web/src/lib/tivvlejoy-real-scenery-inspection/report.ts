import { safetyReport } from './safety';
import type { InspectedSourceReport } from './pipeline';
import type { ApprovalReceipt } from './approval';

export type RealLibraryReport = {
  sourcesInspected: number;
  sourcesStaticOnly: number;
  sourcesDeepInspected: number;
  sourcesBlocked: number;
  quarantinedSources: number;
  logicalCandidates: number;
  approvalReadyCandidates: number;
  humanReviewRequiredCandidates: number;
  approvedCandidates: number;
  heroCandidates: number;
  supportingCandidates: number;
  backgroundCandidates: number;
  interiorCandidates: number;
  vegetationCandidates: number;
  propCandidates: number;
  skyHdriCandidates: number;
  mountainCandidates: number;
  tavernCandidates: number;
  readyForVisualReview: number;
  humanApprovalsIssued: number;
  approvedLogicalAssets: number;
  realPrivateSourceAccessAvailable: boolean;
  realCommercialSourcesRead: number;
  evidenceIsReal: boolean;
  safety: ReturnType<typeof safetyReport>;
};

export function buildRealLibraryReport(input: {
  inspected: InspectedSourceReport[];
  approvals?: ApprovalReceipt[];
  realPrivateSourceAccessAvailable: boolean;
  realCommercialSourcesRead: number;
}): RealLibraryReport {
  const children = input.inspected.flatMap((item) => item.evidenceByChild);
  const approvals = (input.approvals ?? []).filter((item) => item.issued && item.state === 'APPROVED');
  return {
    sourcesInspected: input.inspected.length,
    sourcesStaticOnly: input.inspected.filter((item) =>
      item.evidenceByChild.some((evidence) => evidence.inspectionMethod.includes('STATIC')),
    ).length,
    sourcesDeepInspected: input.inspected.filter((item) =>
      item.evidenceByChild.some((evidence) => evidence.deepInspection.state === 'DEEP_BLENDER_INSPECTED'),
    ).length,
    sourcesBlocked: input.inspected.filter((item) => item.evidenceByChild.some((evidence) => evidence.blockers.length)).length,
    quarantinedSources: input.inspected.filter((item) => item.quarantined).length,
    logicalCandidates: input.inspected.reduce((sum, item) => sum + item.children.length, 0),
    approvalReadyCandidates: children.filter((item) => item.blockers.length === 0).length,
    humanReviewRequiredCandidates: children.filter((item) => item.quality.tiers.includes('HERO')).length,
    approvedCandidates: approvals.length,
    heroCandidates: children.filter((item) => item.quality.tiers.includes('HERO')).length,
    supportingCandidates: children.filter((item) => item.quality.tiers.includes('SUPPORTING')).length,
    backgroundCandidates: children.filter((item) => item.quality.tiers.includes('BACKGROUND')).length,
    interiorCandidates: children.filter((item) => item.semanticClassification.roles.includes('INTERIOR_SHELL') || item.semanticClassification.roles.includes('INTERIOR_PROP')).length,
    vegetationCandidates: children.filter((item) =>
      item.semanticClassification.roles.some((role) =>
        role.startsWith('TREE_') || ['GRASS', 'FLOWERS', 'SHRUBS', 'GROUND_COVER'].includes(role),
      ),
    ).length,
    propCandidates: children.filter((item) =>
      item.semanticClassification.roles.some((role) => role === 'STREET_PROP' || role === 'STORY_PROP' || role === 'INTERIOR_PROP'),
    ).length,
    skyHdriCandidates: children.filter((item) => item.semanticClassification.roles.includes('SKY')).length,
    mountainCandidates: children.filter((item) => item.semanticClassification.roles.some((role) => role.startsWith('MOUNTAIN_'))).length,
    tavernCandidates: children.filter((item) => item.archetypes.archetypes.some((item) => String(item.id).toLowerCase().includes('tavern'))).length,
    readyForVisualReview: input.inspected.reduce((sum, item) => sum + item.readyForVisualReview, 0),
    humanApprovalsIssued: approvals.length,
    approvedLogicalAssets: approvals.length,
    realPrivateSourceAccessAvailable: input.realPrivateSourceAccessAvailable,
    realCommercialSourcesRead: input.realCommercialSourcesRead,
    evidenceIsReal: input.realCommercialSourcesRead > 0,
    safety: safetyReport(),
  };
}
