import { classifyDepth, classifyQuality, classifySemanticRoles } from '@/lib/tivvlejoy-real-scenery-inspection/classify';
import { discoverLogicalAssetsFromInventory } from '@/lib/tivvlejoy-real-scenery-inspection/logical';
import { assessStyleCompatibility } from '@/lib/tivvlejoy-real-scenery-inspection/style';
import { queueVisualEvidence } from '@/lib/tivvlejoy-real-scenery-inspection/visual';
import { stableId } from './hash';
import type { RealLogicalCandidate, RealStaticInspection, StyleState } from './types';

export function discoverRealLogicalCandidates(input: {
  inspection: RealStaticInspection;
  objectNames?: string[];
  descriptions?: string[];
  styleCues?: Parameters<typeof assessStyleCompatibility>[0];
}): RealLogicalCandidate[] {
  const names = input.objectNames ?? [];
  if (names.length === 0) {
    return [];
  }
  const children = discoverLogicalAssetsFromInventory({
    sourceId: input.inspection.sourceId,
    sourceSha256: input.inspection.hash.observedSha256,
    objectNames: names,
    descriptions: input.descriptions,
  });
  return children
    .filter((child) => child.geometryEvidenceRef || child.materialEvidenceRef || names.length > 0)
    .map((child) => {
      const semantic = classifySemanticRoles({
        kind: child.assetKind,
        evidence: {
          geometryObjectNames: names,
          sourceDescriptions: input.descriptions,
          manualMetadata: [input.inspection.format],
        },
      });
      const style = assessStyleCompatibility(input.styleCues ?? { realismLevel: 'UNKNOWN', textureStyle: 'UNKNOWN' });
      const quality = classifyQuality({
        triangleEstimate: typeof input.inspection.glb?.approximateTriangles === 'number' ? Number(input.inspection.glb.approximateTriangles) : null,
        textureMax: 1024,
        style: style.state,
        roles: semantic.roles,
      });
      const depth = classifyDepth({
        roles: semantic.roles,
        quality: quality.tiers,
      });
      const heroCandidate = quality.tiers.includes('HERO') || semantic.roles.some((role) => role.endsWith('_HERO'));
      const interiorCandidate = semantic.roles.includes('INTERIOR_SHELL') || semantic.roles.includes('INTERIOR_PROP');
      const mountainCandidate = semantic.roles.includes('MOUNTAIN_HERO') || semantic.roles.includes('MOUNTAIN_BACKGROUND');
      const propCandidate = semantic.roles.includes('STORY_PROP') || semantic.roles.includes('STREET_PROP') || semantic.roles.includes('INTERIOR_PROP');
      const technicallyBlocked = input.inspection.quarantined || input.inspection.hash.state === 'HASH_MISMATCH';
      return {
        assetCandidateId: child.assetCandidateId || `cand:${stableId([input.inspection.sourceId, child.internalStableRef])}`,
        sourceId: input.inspection.sourceId,
        sourceSha256: input.inspection.hash.observedSha256,
        roles: semantic.roles,
        quality: quality.tiers,
        depth: depth.tiers,
        style: style.state as StyleState,
        styleConfidence: style.state === 'UNKNOWN' ? 'LOW' : 'MEDIUM',
        heroCandidate,
        interiorCandidate,
        mountainCandidate,
        propCandidate,
        readyForVisualReview: !technicallyBlocked,
        technicallyBlocked,
        worldBuilderFeed: 'AVAILABLE_FOR_REVIEW' as const,
        selectableApprovedAsset: false as const,
        humanApproved: false as const,
        evidenceRefs: [child.geometryEvidenceRef, child.materialEvidenceRef, child.textureEvidenceRef].filter(
          (item): item is string => Boolean(item),
        ),
      };
    });
}

export function visualReviewTasksFor(candidate: RealLogicalCandidate) {
  const queued = queueVisualEvidence({
    assetCandidateId: candidate.assetCandidateId,
    roles: candidate.roles as never,
    quality: candidate.quality,
  });
  const extras: string[] = [];
  if (candidate.mountainCandidate) extras.push('silhouette view', 'story-camera view', 'distant-background view');
  if (candidate.interiorCandidate) extras.push('entrance', 'interior hero angle', 'camera corridor', 'furniture density', 'material closeup');
  if (candidate.roles.includes('BUILDING_HERO') || candidate.roles.includes('SIGNAGE')) {
    extras.push('street', 'hero building', 'bakery', 'map shop');
  }
  return {
    ...queued,
    extraViews: extras,
    humanApprovalIssued: false as const,
  };
}

export function sceneryGapKind(input: {
  approved: boolean;
  inspected: boolean;
  nativeProcedural: boolean;
  syntheticOnly: boolean;
}): 'REAL_APPROVED' | 'REAL_INSPECTED_NOT_APPROVED' | 'SYNTHETIC_ONLY' | 'NATIVE_PROCEDURAL' | 'MISSING' {
  if (input.approved) return 'REAL_APPROVED';
  if (input.inspected) return 'REAL_INSPECTED_NOT_APPROVED';
  if (input.nativeProcedural) return 'NATIVE_PROCEDURAL';
  if (input.syntheticOnly) return 'SYNTHETIC_ONLY';
  return 'MISSING';
}
