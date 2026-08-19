export const BRIDGE_SCHEMA = 'TIVVLEJOY_APPROVED_ASSET_WORLD_BUILDER_BRIDGE_V1' as const;
export const INSPECTION_EVIDENCE_SCHEMA = 'TIVVLEJOY_ASSET_INSPECTION_EVIDENCE_V1' as const;
export const APPROVAL_RECEIPT_SCHEMA = 'TIVVLEJOY_ASSET_APPROVAL_RECEIPT_V1' as const;
export const APPROVED_ENVIRONMENT_ASSET_SCHEMA = 'TIVVLEJOY_APPROVED_ENVIRONMENT_ASSET_V1' as const;
export const APPROVED_ASSET_REGISTRY_SCHEMA = 'TIVVLEJOY_APPROVED_ASSET_REGISTRY_V1' as const;
export const SOURCE_CATEGORY_MAPPING_SCHEMA = 'TIVVLEJOY_SOURCE_CATEGORY_MAPPING_V1' as const;
export const RESOLUTION_REQUEST_SCHEMA = 'TIVVLEJOY_ASSET_RESOLUTION_REQUEST_V1' as const;
export const RESOLUTION_RECEIPT_SCHEMA = 'TIVVLEJOY_ASSET_RESOLUTION_RECEIPT_V1' as const;
export const RESOLUTION_FAILURE_SCHEMA = 'TIVVLEJOY_ASSET_RESOLUTION_FAILURE_V1' as const;
export const RESOLVED_ASSET_SLOT_SCHEMA = 'TIVVLEJOY_WORLD_BUILDER_RESOLVED_ASSET_SLOT_V1' as const;
export const RESOLVER_SCHEMA = 'TIVVLEJOY_APPROVED_ASSET_REGISTRY_RESOLVER_V1' as const;

export const PRODUCTION_SEMANTIC_ROLES = [
  'BUILDING_HERO',
  'BUILDING_SUPPORT',
  'INTERIOR_SHELL',
  'INTERIOR_PROP',
  'TREE_HERO',
  'TREE_SUPPORT',
  'TREE_BACKGROUND',
  'GRASS',
  'FLOWERS',
  'SHRUBS',
  'GROUND_COVER',
  'FOREST_UNDERSTORY',
  'VINES',
  'REEDS',
  'PATH',
  'TERRAIN_SURFACE',
  'ROCK',
  'MOUNTAIN_HERO',
  'MOUNTAIN_BACKGROUND',
  'WATER',
  'SKY',
  'SIGNAGE',
  'STREET_PROP',
  'STORY_PROP',
  'FOREGROUND_FRAME',
  'BACKGROUND_FILL',
] as const;
export type ProductionSemanticRole = (typeof PRODUCTION_SEMANTIC_ROLES)[number];

export const ROLE_ALIASES = {
  SHRUB: 'SHRUBS',
} as const;

export const COVERAGE_CATEGORIES = [
  'architecture',
  'vegetation',
  'terrain',
  'roads_paths',
  'water',
  'interiors',
  'props',
  'backgrounds',
  'lighting',
  'weather',
  'seasonal_variants',
  'story_signage',
  'hero_locations',
] as const;
export type CoverageCategory = (typeof COVERAGE_CATEGORIES)[number];

export const DEPTHS = ['FOREGROUND', 'MIDGROUND', 'BACKGROUND'] as const;
export type Depth = (typeof DEPTHS)[number];

export const QUALITY_TIERS = ['HERO', 'SUPPORTING', 'BACKGROUND'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const CANONICAL_STATES = ['PRIMARY', 'ALTERNATE_APPROVED', 'DUPLICATE', 'ARCHIVAL'] as const;
export type CanonicalState = (typeof CANONICAL_STATES)[number];

export const APPROVAL_DECISIONS = ['APPROVED', 'BLOCKED', 'QUARANTINED', 'ARCHIVAL_ONLY'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const BRIDGE_LIFECYCLE_STATES = [
  'DISCOVERED',
  'SOURCE_VERIFIED',
  'INSPECTION_PENDING',
  'INSPECTING',
  'INSPECTION_PASSED',
  'VISUAL_APPROVAL_PENDING',
  'APPROVED',
  'ARCHIVAL_ONLY',
  'BLOCKED_SOURCE_MISSING',
  'BLOCKED_SIZE_MISMATCH',
  'BLOCKED_HASH_MISSING',
  'BLOCKED_HASH_MISMATCH',
  'BLOCKED_ARCHIVE_CORRUPT',
  'BLOCKED_UNSUPPORTED_FORMAT',
  'BLOCKED_PROVENANCE_UNKNOWN',
  'BLOCKED_LICENSE',
  'BLOCKED_MISSING_TEXTURES',
  'BLOCKED_EXTERNAL_DEPENDENCY',
  'BLOCKED_UNAPPROVED_ADDON_DEPENDENCY',
  'BLOCKED_UNSAFE_CONTENT',
  'BLOCKED_BLENDER_INCOMPATIBLE',
  'BLOCKED_GEOMETRY_INVALID',
  'BLOCKED_MATERIAL_INVALID',
  'BLOCKED_DUPLICATE_CANONICAL_UNRESOLVED',
  'BLOCKED_VISUAL_REVIEW',
  'QUARANTINED',
] as const;
export type BridgeLifecycleState = (typeof BRIDGE_LIFECYCLE_STATES)[number];

export const RESOLUTION_FAILURE_STATES = [
  'UNRESOLVED_NO_ELIGIBLE_ASSET',
  'UNRESOLVED_SOURCE_RECEIPT',
  'UNRESOLVED_SOURCE_HASH',
  'UNRESOLVED_INSPECTION_RECEIPT',
  'UNRESOLVED_APPROVAL_RECEIPT',
  'UNRESOLVED_PROVENANCE',
  'BLOCKED_UNAPPROVED',
  'BLOCKED_QUARANTINED',
  'BLOCKED_HASH_MISMATCH',
  'BLOCKED_VERSION_MISMATCH',
  'BLOCKED_LICENSE',
  'BLOCKED_STYLE_INCOMPATIBLE',
  'BLOCKED_TECHNICAL_INCOMPATIBLE',
  'BLOCKED_CANONICAL_CONFLICT',
  'BLOCKED_CONTINUITY_PIN_INVALID',
] as const;
export type ResolutionFailureState = (typeof RESOLUTION_FAILURE_STATES)[number];

export const LIBRARY_CAPABILITY_STATES = [
  'PLANNED_NATIVE_CAPABILITY',
  'APPROVED_LIBRARY_CAPABILITY',
  'PARTIAL_APPROVED_LIBRARY',
  'NO_APPROVED_LIBRARY_MATCH',
  'BLOCKED_LIBRARY_SOURCE',
] as const;
export type LibraryCapabilityState = (typeof LIBRARY_CAPABILITY_STATES)[number];

export type ApprovedAuditSourceInput = {
  sourceId: string;
  catalogPresent: boolean;
  receiptPresent: boolean;
  stored: boolean;
  sizeVerified: boolean;
  sourceSha256: string | null;
  sourceReceiptRef: string | null;
  inspectionState: 'NOT_APPLICABLE' | 'AWAITING_INSPECTION' | 'INSPECTION_PASSED' | 'INSPECTION_FAILED';
  productionUsable: boolean;
  worldBuilderEligible: boolean;
  duplicateState: 'NONE' | 'DUPLICATE_SHA' | 'DUPLICATE_PACKAGE_VERSION';
  canonicalCandidate: boolean;
  blockers: string[];
  warnings: string[];
  activation: 'STORE_ONLY' | 'INSTALL_LATER' | 'OPTIONAL_NOT_INTEGRATED' | 'UNKNOWN';
  sourceImmutable: boolean;
};

export type InspectionEvidence = {
  schemaVersion: typeof INSPECTION_EVIDENCE_SCHEMA;
  sourceId: string;
  sourceReceiptRef: string;
  sourceSha256: string;
  storedByteSize: number;
  expectedByteSize: number;
  sizeVerified: boolean;
  inspectionId: string;
  inspectionVersion: string;
  inspectionPerformedAt: string;
  containerIntegrity: 'PASSED' | 'FAILED';
  discoveredAssetId: string;
  discoveredAssetKind: string;
  nativeFormat: string;
  blenderCompatibility: 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNKNOWN';
  geometryMetrics: Record<string, number | string> | null;
  materialMetrics: Record<string, number | string> | null;
  textureMetrics: Record<string, number | string> | null;
  dimensions: { x: number; y: number; z: number } | null;
  originAssessment: string;
  scaleAssessment: string;
  externalDependencies: string[];
  requiredAddonDependencies: string[];
  missingTextureRefs: string[];
  missingExternalRefs: string[];
  safetyAssessment: { scripts: 'SAFE' | 'UNSAFE'; network: 'SAFE' | 'UNSAFE'; shell: 'SAFE' | 'UNSAFE' };
  provenanceState: 'RESOLVED' | 'UNKNOWN';
  licenseState: 'APPROVED_INTERNAL' | 'BLOCKED' | 'UNKNOWN';
  visualEvidenceRefs: string[];
  styleFingerprint: string;
  semanticClassification: {
    roles: ProductionSemanticRole[];
    coverageCategories: CoverageCategory[];
    archetypes: string[];
    biomes: string[];
    kind: string;
  };
  canonicalRecommendation: { groupId: string; state: CanonicalState };
  inspectionWarnings: string[];
  inspectionBlockers: string[];
  inspectionSha256: string;
};

export type ApprovalReceipt = {
  schemaVersion: typeof APPROVAL_RECEIPT_SCHEMA;
  approvalReceiptId: string;
  assetId: string;
  assetVersion: string;
  sourceId: string;
  sourceReceiptRef: string;
  sourceSha256: string;
  inspectionReceiptRef: string;
  inspectionSha256: string;
  approvalDecision: ApprovalDecision;
  approvedSemanticRoles: ProductionSemanticRole[];
  approvedCoverageCategories: CoverageCategory[];
  approvedArchetypes: string[];
  visualApprovalRequired: boolean;
  visualApprovalSatisfied: boolean;
  licenseState: 'APPROVED_INTERNAL' | 'BLOCKED' | 'UNKNOWN';
  provenanceState: 'RESOLVED' | 'UNKNOWN';
  approvedAt: string;
  approvedByPolicy: string;
  sourceImmutable: true;
  rawRedistributionAllowed: false;
  approvalSha256: string;
};

export type ApprovedEnvironmentAsset = {
  schemaVersion: typeof APPROVED_ENVIRONMENT_ASSET_SCHEMA;
  assetId: string;
  assetVersion: string;
  sourceId: string;
  sourceReceiptRef: string;
  sourceSha256: string;
  inspectionReceiptRef: string;
  inspectionSha256: string;
  approvalReceiptRef: string;
  approvalSha256: string;
  displayName: string;
  originalFilename?: string;
  assetKind: string;
  semanticRoles: ProductionSemanticRole[];
  coverageCategories: CoverageCategory[];
  archetypeCompatibility: string[];
  biomeTags: string[];
  depthEligibility: Depth[];
  qualityEligibility: QualityTier[];
  seasonCompatibility: Array<'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | 'ANY'>;
  weatherCompatibility: Array<'CLEAR' | 'RAIN' | 'SNOW' | 'FOG' | 'ANY'>;
  styleCompatibility: 'EXACT' | 'HARMONIZABLE' | 'INCOMPATIBLE';
  blenderCompatibility: 'COMPATIBLE' | 'INCOMPATIBLE';
  complexityClass: number;
  canonicalGroupId: string;
  canonicalState: CanonicalState;
  duplicateOfAssetId: string | null;
  supersedesAssetId: string | null;
  fallbackEligible: boolean;
  approvalState: ApprovalDecision;
  provenanceState: 'RESOLVED' | 'UNKNOWN';
  licenseState: 'APPROVED_INTERNAL' | 'BLOCKED' | 'UNKNOWN';
  sourceImmutable: true;
  rawRedistributionAllowed: false;
  worldBuilderEligible: boolean;
  shotAssemblyEligible: boolean;
  assetDependencySha256: string;
  lifecycleState: BridgeLifecycleState;
  provider: 'NATIVE_BLENDER' | 'APPROVED_LIBRARY' | 'BOTANIQ_IF_APPROVED';
  botaniqActivated: false;
  geoScatterIntegrated: false;
};

export type ApprovedAssetRegistry = {
  schemaVersion: typeof APPROVED_ASSET_REGISTRY_SCHEMA;
  registryVersion: string;
  generatedFromAuditSha256: string | null;
  assets: ApprovedEnvironmentAsset[];
  registrySha256: string;
  filenameSelectionAllowed: false;
  mutableLatestAllowed: false;
  conflictedCanonicalGroups: string[];
  indexes: {
    bySemanticRole: Record<string, string[]>;
    byArchetype: Record<string, string[]>;
    byCanonicalGroup: Record<string, string[]>;
  };
};

export type AssetResolutionRequest = {
  schemaVersion: typeof RESOLUTION_REQUEST_SCHEMA;
  slotId: string;
  semanticRole: ProductionSemanticRole | 'SHRUB';
  archetypeId: string;
  biome: string;
  depth: Depth;
  qualityTier: QualityTier;
  season: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
  weather: string;
  styleRequirement: 'TIVVLEJOY_STORYBOOK';
  seed: number;
  continuityAssetId?: string;
  registrySnapshotSha256: string;
  requestSha256: string;
};

export type RankTuple = readonly [
  continuity: number,
  canonical: number,
  archetype: number,
  biome: number,
  depth: number,
  quality: number,
  style: number,
  season: number,
  weather: number,
  complexity: number,
  tieBreakSha256: string,
];

export type AssetResolutionReceipt = {
  schemaVersion: typeof RESOLUTION_RECEIPT_SCHEMA;
  slotId: string;
  requestSha256: string;
  registrySnapshotSha256: string;
  selectedAssetId: string;
  selectedAssetVersion: string;
  sourceId: string;
  sourceReceiptRef: string;
  sourceSha256: string;
  inspectionReceiptRef: string;
  inspectionSha256: string;
  approvalReceiptRef: string;
  approvalSha256: string;
  assetDependencySha256: string;
  rankTuple: RankTuple;
  tieBreakSha256: string;
  resolutionState: 'RESOLVED_APPROVED';
  filenameUsedForSelection: false;
  mutableLatestUsed: false;
  resolutionReceiptSha256: string;
};

export type AssetResolutionFailure = {
  schemaVersion: typeof RESOLUTION_FAILURE_SCHEMA;
  slotId: string;
  requestSha256: string;
  registrySnapshotSha256: string;
  resolutionState: ResolutionFailureState;
  selectedAssetId: null;
  reason: string;
  filenameUsedForSelection: false;
  mutableLatestUsed: false;
  inventedSource: false;
  resolutionReceiptSha256: string;
};

export type ResolutionResult = AssetResolutionReceipt | AssetResolutionFailure;

export function isResolutionFailure(result: ResolutionResult): result is AssetResolutionFailure {
  return result.selectedAssetId === null;
}
