import type { AbstractSourceReceipt, EvidenceClass } from './types';
import { inspectZipArchive, type SafeArchiveInspection } from './archive';
import { inspectBlendHeader, inspectFbx, inspectGlb, inspectGltfJson } from './formats';
import { inspectWithIsolatedBlender } from './blender';
import { inspectAddonDependencies, inspectScriptEvidence } from './scripts-addons';
import { auditMaterials, auditTextures } from './textures-materials';
import { auditDependencies } from './dependencies';
import { discoverLogicalAssetsFromInventory, type DiscoveredLogicalAsset } from './logical';
import { classifyArchetypes, classifyDepth, classifyQuality, classifySemanticRoles } from './classify';
import { assessStyleCompatibility, buildHarmonizationRecipe } from './style';
import { analyzeBudget, analyzeScale, analyzeTransform } from './geometry';
import { recommendCanonical } from './canonical';
import { reviewProvenanceAndLicense } from './provenance';
import { buildInspectionEvidence, type InspectionEvidence } from './evidence';
import { queueVisualEvidence } from './visual';
import { evaluateTechnicalApprovalState } from './approval';
import { quarantineReasonsFrom, quarantineSource } from './quarantine';
import { cleanupMaterialization, materializeSource, type MaterializationResult } from './materialization';

export type InspectedSourceReport = {
  receipt: AbstractSourceReceipt;
  materialization: MaterializationResult;
  archive: SafeArchiveInspection | null;
  children: DiscoveredLogicalAsset[];
  evidenceByChild: InspectionEvidence[];
  quarantined: boolean;
  readyForVisualReview: number;
};

function extOf(name: string | undefined): string {
  if (!name) return '';
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

export async function inspectMaterializedSource(input: {
  receipt: AbstractSourceReceipt;
  bytes?: Uint8Array | null;
  evidenceClass?: EvidenceClass;
  objectNames?: string[];
  descriptions?: string[];
  style?: Parameters<typeof assessStyleCompatibility>[0];
}): Promise<InspectedSourceReport> {
  const materialization = await materializeSource({ receipt: input.receipt, bytes: input.bytes ?? null });
  const bytes = materialization.state === 'SOURCE_READY' || materialization.state === 'SOURCE_HASH_MISSING' ? input.bytes ?? null : input.bytes ?? null;
  const format = extOf(input.receipt.formatHint) || extOf(input.receipt.originalFilename) || extOf(input.receipt.sourceId);
  const archive = bytes && (format === '.zip' || bytes[0] === 0x50) ? inspectZipArchive(bytes) : null;
  const texts = [
    input.receipt.displayName ?? '',
    input.receipt.originalFilename ?? '',
    ...(input.descriptions ?? []),
    ...(archive?.pythonOrScriptPaths ?? []),
    ...(input.objectNames ?? []),
  ];
  const scripts = inspectScriptEvidence(texts);
  const addons = inspectAddonDependencies(texts);
  const glb = bytes && format === '.glb' ? inspectGlb(bytes) : undefined;
  const gltf = bytes && format === '.gltf' ? inspectGltfJson(new TextDecoder().decode(bytes)) : undefined;
  const fbx = bytes && format === '.fbx' ? inspectFbx(bytes) : undefined;
  const blend = bytes && format === '.blend' ? inspectBlendHeader(bytes) : undefined;
  const deep = inspectWithIsolatedBlender({ sourcePath: materialization.sourcePath ?? undefined });
  const textureAudit = auditTextures({
    refs: [
      ...(archive?.texturePaths ?? []).map((ref) => ({ ref, missing: false })),
      ...(archive?.hdriPaths ?? []).map((ref) => ({ ref, format: extOf(ref), missing: false })),
    ],
  });
  const materialAudit = auditMaterials({
    materials: (archive?.materialPaths ?? ['default']).map((name) => ({
      name,
      pbr: true,
      textureDependencies: archive?.texturePaths ?? [],
    })),
  });
  const dependencies = auditDependencies({
    missingTextures: textureAudit.missingReferences,
    missingHdris: archive?.hdriPaths.filter((path) => path.includes('MISSING')) ?? [],
  });
  const children = discoverLogicalAssetsFromInventory({
    sourceId: input.receipt.sourceId,
    sourceSha256: materialization.observedSha256 ?? input.receipt.sourceSha256,
    objectNames: input.objectNames ?? archive?.geometryPaths,
    geometryPaths: archive?.geometryPaths,
    descriptions: input.descriptions,
  });
  const license = reviewProvenanceAndLicense(input.receipt);
  const style = assessStyleCompatibility(input.style ?? { realismLevel: 'STORYBOOK', textureStyle: 'PAINTED' });
  const evidenceByChild: InspectionEvidence[] = children.map((child) => {
    const semantic = classifySemanticRoles({
      kind: child.assetKind,
      evidence: {
        geometryObjectNames: input.objectNames ?? archive?.geometryPaths,
        sourceDescriptions: input.descriptions,
        manualMetadata: [input.receipt.displayName ?? '', input.receipt.packageFamily ?? ''],
        filenameHint: input.receipt.originalFilename,
      },
    });
    const quality = classifyQuality({
      triangleEstimate: glb?.triangleEstimate ?? null,
      textureMax: 1024,
      materialComplete: materialAudit.materialCount > 0,
      technicallyClean: !dependencies.approvalReadyBlocked && scripts.state !== 'UNSAFE_EXECUTION_DEPENDENCY',
      dependenciesComplete: !dependencies.approvalReadyBlocked,
      style: style.state,
      roles: semantic.roles,
    });
    const depth = classifyDepth({ quality: quality.tiers, roles: semantic.roles, triangleEstimate: glb?.triangleEstimate });
    const archetypes = classifyArchetypes({ roles: semantic.roles, kind: child.assetKind, evidence: { sourceDescriptions: input.descriptions, manualMetadata: [input.receipt.packageFamily ?? ''] } });
    const canonical = recommendCanonical({ receipt: input.receipt, child });
    const blockers = [
      ...(materialization.blocker && materialization.state !== 'SOURCE_READY' && materialization.state !== 'SOURCE_HASH_MISSING' ? [materialization.state] : []),
      ...(archive?.refused ? [archive.state] : []),
      ...dependencies.blockers,
      ...(scripts.state === 'UNSAFE_EXECUTION_DEPENDENCY' ? [scripts.state] : []),
      ...(license.licenseState === 'LICENSE_BLOCKED' ? ['LICENSE_BLOCKED'] : []),
      ...(gltf?.blocker ? [gltf.blocker] : []),
    ];
    return buildInspectionEvidence({
      sourceId: input.receipt.sourceId,
      sourceReceiptRef: input.receipt.sourceReceiptRef,
      sourceSha256: materialization.observedSha256 ?? input.receipt.sourceSha256,
      storedByteSize: materialization.observedByteSize ?? input.receipt.storedByteSize,
      sourceState: materialization.state,
      containerState: archive?.state ?? 'NOT_AN_ARCHIVE',
      staticFormatFindings: { glb, gltf, fbx, blend },
      deepInspection: deep,
      dependencyFindings: dependencies,
      textureFindings: textureAudit,
      materialFindings: materialAudit,
      geometryFindings: {
        scale: analyzeScale({}),
        transform: analyzeTransform({}),
        budget: analyzeBudget({ triangleEstimate: glb?.triangleEstimate ?? null, materialCount: materialAudit.materialCount, quality: quality.tiers[0] ?? 'BACKGROUND' }),
      },
      semanticClassification: semantic,
      styleClassification: style,
      quality,
      depth,
      archetypes,
      canonicalRecommendation: canonical,
      scriptSafety: scripts,
      addonDependencies: addons,
      warnings: [
        ...(style.state === 'HARMONIZABLE' ? ['HARMONIZATION_RECIPE_AVAILABLE'] : []),
        ...(deep.state === 'DEEP_BLENDER_INSPECTION_PENDING' ? ['DEEP_BLENDER_INSPECTION_PENDING'] : []),
      ],
      blockers,
      inspectionMethod: input.evidenceClass ?? (bytes ? 'STATIC_REAL_SOURCE_INSPECTION' : 'PLANNING_ONLY'),
      inspectionConfidence: bytes && !archive?.refused ? 'MEDIUM' : 'LOW',
    });
  });
  const reasons = quarantineReasonsFrom({
    sourceState: materialization.state,
    archiveState: archive?.state,
    scriptState: scripts.state,
    dependencyBlockers: dependencies.blockers,
    licenseState: license.licenseState,
    provenanceState: license.provenanceState,
  });
  const readyForVisualReview = evidenceByChild.filter((item) => evaluateTechnicalApprovalState({
    blockers: item.blockers,
    visualRequired: item.quality.tiers.includes('HERO'),
    visualSatisfied: false,
  }) === 'READY_FOR_VISUAL_REVIEW').length;
  if (materialization.workspace) cleanupMaterialization(materialization);
  return {
    receipt: input.receipt,
    materialization: { ...materialization, workspace: null, sourcePath: null },
    archive,
    children,
    evidenceByChild,
    quarantined: Boolean(quarantineSource(input.receipt.sourceId, reasons)),
    readyForVisualReview,
  };
}

export function childVisualQueue(evidence: InspectionEvidence) {
  return queueVisualEvidence({
    assetCandidateId: evidence.semanticClassification.roles.join(',') || evidence.sourceId,
    roles: evidence.semanticClassification.roles,
    quality: evidence.quality.tiers,
  });
}

export function childHarmonization(evidence: InspectionEvidence) {
  return buildHarmonizationRecipe(evidence.styleClassification);
}
