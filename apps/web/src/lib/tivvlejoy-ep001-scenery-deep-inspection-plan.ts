import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001SceneryLicenseEvidence } from '@/lib/tivvlejoy-ep001-scenery-license-evidence';

export const EP001_SCENERY_DEEP_INSPECTION_PLAN_SCHEMA = 'TIVVLEJOY_EP001_SCENERY_DEEP_INSPECTION_PLAN_V1' as const;

type InspectionMode = 'BLENDER_OPEN_READONLY' | 'FBX_IMPORT_ISOLATED' | 'TEXTURE_STATIC_INSPECTION' | 'BLENDER_ASSET_LIBRARY_READONLY';

const SOURCE_PLANS: Record<string, { mode: InspectionMode; expectedEvidence: readonly string[]; checks: readonly string[] }> = {
  VILLAGE_FBX_V1: {
    mode: 'FBX_IMPORT_ISOLATED',
    checks: ['import each FBX into a disposable blank scene', 'record object/mesh/material counts', 'measure bounds and scale', 'check missing texture references', 'render neutral-turntable contact sheets for representative cabins, trees and props'],
    expectedEvidence: ['import-report.json','asset-inventory.json','bounds-report.json','missing-dependencies.json','representative-contact-sheet.png'],
  },
  VILLAGE_BLEND_402_V1: {
    mode: 'BLENDER_OPEN_READONLY',
    checks: ['open each .blend without saving', 'record Blender version compatibility', 'inventory collections/objects/materials/images/modifiers', 'detect linked or missing external dependencies', 'capture representative cabin/tree/prop contact sheets'],
    expectedEvidence: ['blend-open-report.json','scene-inventory.json','dependency-report.json','representative-contact-sheet.png'],
  },
  VILLAGE_TEXTURES_V1: {
    mode: 'TEXTURE_STATIC_INSPECTION',
    checks: ['decode every production texture', 'record dimensions/channels/bit depth', 'group material families', 'detect corrupt or missing expected maps', 'record exact texture SHA-256 values'],
    expectedEvidence: ['texture-inventory.json','texture-hashes.json','decode-failures.json'],
  },
  VILLAGE_PROJECT_V1: {
    mode: 'BLENDER_OPEN_READONLY',
    checks: ['open project .blend without saving', 'inventory scene hierarchy/materials/images/modifiers', 'compare project asset identities with standalone Village archives', 'detect missing dependencies', 'capture full-project overview contact sheet'],
    expectedEvidence: ['project-open-report.json','project-inventory.json','cross-source-identity-report.json','project-overview.png'],
  },
  FOREST_TEXTURES_4096_V1: {
    mode: 'TEXTURE_STATIC_INSPECTION',
    checks: ['decode all non-macOS TGA maps', 'record dimensions/channels/bit depth', 'group Rocks/Foliage/Trunks/Leaves material families', 'detect corrupt maps', 'record exact texture SHA-256 values'],
    expectedEvidence: ['forest-texture-inventory.json','forest-texture-hashes.json','forest-decode-failures.json'],
  },
  WORLD_SHADER_SKY_V1: {
    mode: 'BLENDER_OPEN_READONLY',
    checks: ['open Sky_World.blend without saving', 'inventory world nodes and images', 'reject external executable/script dependency', 'render neutral sky reference at fixed exposure', 'record color-management assumptions'],
    expectedEvidence: ['sky-open-report.json','world-node-inventory.json','sky-reference.png','color-management.json'],
  },
  PROCEDURAL_FLORA_LIBRARY_V1: {
    mode: 'BLENDER_OPEN_READONLY',
    checks: ['open Flora source without saving', 'inventory geometry-node groups/materials/models', 'do not execute untrusted embedded scripts', 'instantiate only reviewed node groups in a disposable scene', 'capture representative floral/grass/fern/bush/tree contact sheet'],
    expectedEvidence: ['flora-open-report.json','flora-node-inventory.json','flora-model-inventory.json','flora-contact-sheet.png'],
  },
  PROCEDURAL_ASSET_LIBRARY_V1: {
    mode: 'BLENDER_ASSET_LIBRARY_READONLY',
    checks: ['mount library read-only', 'inventory catalogs and assets', 'resolve catalog preview-to-asset identities', 'instantiate representative assets in a disposable scene only', 'capture family coverage contact sheet'],
    expectedEvidence: ['asset-library-inventory.json','catalog-identity-report.json','asset-family-coverage.json','asset-library-contact-sheet.png'],
  },
};

export function compileEp001SceneryDeepInspectionPlan() {
  const licenses = compileEp001SceneryLicenseEvidence();
  const items = licenses.records.map((record) => {
    const plan = SOURCE_PLANS[record.sourceId];
    if (!plan) throw new Error(`EP001_SCENERY_INSPECTION_PLAN_MISSING:${record.sourceId}`);
    return {
      sourceId: record.sourceId,
      dependencyClass: record.dependencyClass,
      inspectionMode: plan.mode,
      licenseEvidenceRequiredBeforeAdmission: true as const,
      inspectionCanRunBeforeLicenseApprovalForPrivateEvaluationOnly: true as const,
      sourceMustRemainImmutable: true as const,
      workOnDisposableCopy: true as const,
      checks: plan.checks,
      expectedEvidence: plan.expectedEvidence,
      currentState: 'NOT_EXECUTED' as const,
      inspectionReceiptSha256: null,
      humanVisualApprovalSha256: null,
      admitted: false as const,
    };
  });

  const body = {
    schemaVersion: EP001_SCENERY_DEEP_INSPECTION_PLAN_SCHEMA,
    episodeId: licenses.episodeId,
    sceneryLicenseEvidenceSha256: licenses.sceneryLicenseEvidenceSha256,
    state: 'EXECUTION_PLAN_READY_NO_BLENDER_SESSION_RUN' as const,
    items,
    globalExecutionRules: [
      'Materialize one exact hash-verified source at a time into an isolated disposable workspace.',
      'Never overwrite or save into the original purchased source archive.',
      'Never auto-run embedded Python, drivers with external side effects, shell commands, installers, or add-on activation.',
      'Blender files open read-only for inspection; any generated derivative scene is a separate working artifact.',
      'Every evidence file is bound to the exact source SHA-256 and Blender/runtime version.',
      'A crash, missing dependency, malformed geometry, unsupported version, or unexpected executable/script dependency quarantines that source until reviewed.',
      'Technical inspection cannot issue license approval or human visual approval.',
    ],
    requiredVisualReview: [
      'materials and texture integrity',
      'scale and proportion',
      'silhouette/readability at 9:16 phone framing',
      'style compatibility with Pip and Goat',
      'child-audience suitability',
      'hero/support/background quality tier',
      'density and composition suitability',
      'lighting response and color consistency',
    ],
    metrics: {
      sourceCount: items.length,
      blenderOpenCount: items.filter((item) => item.inspectionMode === 'BLENDER_OPEN_READONLY').length,
      fbxImportCount: items.filter((item) => item.inspectionMode === 'FBX_IMPORT_ISOLATED').length,
      textureStaticCount: items.filter((item) => item.inspectionMode === 'TEXTURE_STATIC_INSPECTION').length,
      assetLibraryCount: items.filter((item) => item.inspectionMode === 'BLENDER_ASSET_LIBRARY_READONLY').length,
      executedCount: 0 as const,
      admittedCount: 0 as const,
    },
    authority: {
      blenderExecutionPerformed: false as const,
      licenseApprovalIssued: false as const,
      humanVisualApprovalIssued: false as const,
      sceneryAdmissionGranted: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      sourceArchivesModified: false as const,
      embeddedScriptsExecuted: false as const,
      blenderLaunched: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };
  return { ...body, sceneryDeepInspectionPlanSha256: sha256Canonical(body) };
}

export type Ep001SceneryDeepInspectionPlan = ReturnType<typeof compileEp001SceneryDeepInspectionPlan>;
