export const INSPECTION_SYSTEM_SCHEMA = 'TIVVLEJOY_REAL_SCENERY_INSPECTION_AND_ADMISSION_V1' as const;
export const MATERIALIZATION_SCHEMA = 'TIVVLEJOY_SOURCE_MATERIALIZATION_V1' as const;
export const ARCHIVE_INSPECTION_SCHEMA = 'TIVVLEJOY_SAFE_ARCHIVE_INSPECTION_V1' as const;
export const STATIC_3D_SCHEMA = 'TIVVLEJOY_STATIC_3D_FORMAT_INSPECTION_V1' as const;
export const DEPENDENCY_AUDIT_SCHEMA = 'TIVVLEJOY_SCENERY_DEPENDENCY_AUDIT_V1' as const;
export const TEXTURE_MATERIAL_SCHEMA = 'TIVVLEJOY_TEXTURE_MATERIAL_AUDIT_V1' as const;
export const LOGICAL_DISCOVERY_SCHEMA = 'TIVVLEJOY_SCENERY_LOGICAL_ASSET_DISCOVERY_V1' as const;
export const SEMANTIC_CLASSIFICATION_SCHEMA = 'TIVVLEJOY_SCENERY_SEMANTIC_CLASSIFICATION_V1' as const;
export const CANONICALIZATION_SCHEMA = 'TIVVLEJOY_SCENERY_CANONICALIZATION_V1' as const;
export const STYLE_COMPATIBILITY_SCHEMA = 'TIVVLEJOY_SCENERY_STYLE_COMPATIBILITY_V1' as const;
export const VISUAL_EVIDENCE_QUEUE_SCHEMA = 'TIVVLEJOY_SCENERY_VISUAL_EVIDENCE_QUEUE_V1' as const;
export const APPROVAL_WORKFLOW_SCHEMA = 'TIVVLEJOY_SCENERY_APPROVAL_WORKFLOW_V1' as const;
export const REGISTRY_BRIDGE_SCHEMA = 'TIVVLEJOY_REAL_APPROVED_ASSET_REGISTRY_BRIDGE_V1' as const;
export const WORLD_BUILDER_REFRESH_SCHEMA = 'TIVVLEJOY_WORLD_BUILDER_REAL_LIBRARY_REFRESH_V1' as const;
export const PRODUCTION_LIBRARY_SCHEMA = 'TIVVLEJOY_SCENERY_PRODUCTION_LIBRARY_V1' as const;
export const CONTROL_ROOM_SCHEMA = 'TIVVLEJOY_SCENERY_INSPECTION_CONTROL_ROOM_V1' as const;
export const INSPECTION_EVIDENCE_SCHEMA = 'TIVVLEJOY_REAL_SCENERY_INSPECTION_EVIDENCE_V1' as const;
export const APPROVED_ENVIRONMENT_ASSET_SCHEMA = 'TIVVLEJOY_APPROVED_ENVIRONMENT_ASSET_V1' as const;

export const SOURCE_STATES = [
  'SOURCE_READY',
  'SOURCE_NOT_AVAILABLE',
  'SOURCE_SIZE_MISMATCH',
  'SOURCE_HASH_MISSING',
  'SOURCE_HASH_MISMATCH',
  'SOURCE_RECEIPT_MISSING',
  'SOURCE_MATERIALIZATION_FAILED',
] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

export const ARCHIVE_STATES = [
  'ARCHIVE_SAFE',
  'ARCHIVE_UNSAFE_PATH',
  'ARCHIVE_BOMB_RISK',
  'ARCHIVE_TOO_LARGE',
  'ARCHIVE_TOO_MANY_ENTRIES',
  'ARCHIVE_CORRUPT',
  'ARCHIVE_UNSUPPORTED',
] as const;
export type ArchiveState = (typeof ARCHIVE_STATES)[number];

export const SCRIPT_STATES = [
  'NO_SCRIPT_EVIDENCE',
  'SCRIPT_CONTENT_PRESENT_NOT_EXECUTED',
  'SCRIPT_REVIEW_REQUIRED',
  'UNSAFE_EXECUTION_DEPENDENCY',
] as const;
export type ScriptState = (typeof SCRIPT_STATES)[number];

export const ADDON_STATES = [
  'NO_ADDON_DEPENDENCY',
  'OPTIONAL_ADDON',
  'REQUIRED_ADDON',
  'UNKNOWN_ADDON_DEPENDENCY',
] as const;
export type AddonState = (typeof ADDON_STATES)[number];

export const STYLE_STATES = ['EXACT', 'HARMONIZABLE', 'INCOMPATIBLE', 'UNKNOWN'] as const;
export type StyleState = (typeof STYLE_STATES)[number];

export const SCALE_STATES = ['SCALE_PLAUSIBLE', 'SCALE_REVIEW_REQUIRED', 'SCALE_UNKNOWN'] as const;
export type ScaleState = (typeof SCALE_STATES)[number];

export const BUDGET_BANDS = ['LIGHT', 'NORMAL', 'HEAVY', 'VERY_HEAVY'] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number];

export const PROVENANCE_STATES = ['PROVENANCE_RESOLVED', 'PROVENANCE_REVIEW_REQUIRED', 'PROVENANCE_UNKNOWN'] as const;
export type ProvenanceState = (typeof PROVENANCE_STATES)[number];

export const LICENSE_STATES = [
  'LICENSE_INTERNAL_PRODUCTION_APPROVED',
  'LICENSE_REVIEW_REQUIRED',
  'LICENSE_BLOCKED',
] as const;
export type LicenseState = (typeof LICENSE_STATES)[number];

export const APPROVAL_STATES = [
  'NOT_REVIEWED',
  'TECHNICALLY_BLOCKED',
  'READY_FOR_VISUAL_REVIEW',
  'VISUAL_REVIEW_REQUIRED',
  'APPROVED',
  'REJECTED',
  'ARCHIVAL_ONLY',
] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const QUARANTINE_REASONS = [
  'HASH_MISMATCH',
  'CORRUPT_ARCHIVE',
  'PATH_TRAVERSAL',
  'ARCHIVE_BOMB_RISK',
  'UNSAFE_SCRIPT_DEPENDENCY',
  'MISSING_REQUIRED_DEPENDENCY',
  'LICENSE_BLOCKED',
  'PROVENANCE_BLOCKED',
] as const;
export type QuarantineReason = (typeof QUARANTINE_REASONS)[number];

export const EVIDENCE_CLASSES = [
  'REAL_SOURCE_INSPECTION',
  'STATIC_REAL_SOURCE_INSPECTION',
  'DEEP_REAL_SOURCE_INSPECTION',
  'SYNTHETIC_FIXTURE',
  'PLANNING_ONLY',
] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const LIBRARY_ANALYSIS_CLASSES = [
  'SYNTHETIC_PLANNING_ANALYSIS',
  'REAL_APPROVED_LIBRARY_ANALYSIS',
] as const;
export type LibraryAnalysisClass = (typeof LIBRARY_ANALYSIS_CLASSES)[number];

export const LIBRARY_CATEGORIES = [
  'APPROVED_HERO',
  'APPROVED_SUPPORTING',
  'APPROVED_BACKGROUND',
  'APPROVED_INTERIOR',
  'APPROVED_PROP',
  'APPROVED_VEGETATION',
  'APPROVED_SKY',
  'ARCHIVAL',
  'BLOCKED',
  'AWAITING_REVIEW',
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export const TEXTURE_MAP_KINDS = [
  'BASE_COLOR',
  'NORMAL',
  'ROUGHNESS',
  'METALLIC',
  'AO',
  'ORM',
  'EMISSION',
  'OPACITY',
  'HEIGHT',
  'UNKNOWN',
] as const;
export type TextureMapKind = (typeof TEXTURE_MAP_KINDS)[number];

export const MATERIAL_CLASSES = [
  'STORYBOOK_READY_CANDIDATE',
  'HARMONIZATION_REQUIRED',
  'TECHNICAL_REVIEW_REQUIRED',
  'UNSUPPORTED',
] as const;
export type MaterialClass = (typeof MATERIAL_CLASSES)[number];

export const PARSER_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ParserConfidence = (typeof PARSER_CONFIDENCE)[number];

export const QUALITY_TIERS = ['HERO', 'SUPPORTING', 'BACKGROUND'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const DEPTH_TIERS = ['FOREGROUND', 'MIDGROUND', 'BACKGROUND'] as const;
export type DepthTier = (typeof DEPTH_TIERS)[number];

export const ASSET_KINDS = [
  'building',
  'tree',
  'rock',
  'barrel',
  'table',
  'chair',
  'terrain_piece',
  'mountain',
  'sky',
  'interior_shell',
  'street_prop',
  'furniture',
  'vegetation',
  'water',
  'path',
  'signage',
  'material_library',
  'procedural_material_source',
  'hdri',
  'unknown',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

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

export const SPECIALTY_STORY_ROLES = [
  'CAVE_HERO',
  'COASTAL_HERO',
  'UNDERWATER_HERO',
  'AMUSEMENT_RIDE_HERO',
  'DESERT_HERO',
  'CASTLE_RUIN_HERO',
  'SWAMP_HERO',
] as const;

export const WORLD_BUILDER_ARCHETYPES = [
  'village',
  'main street',
  'bakery',
  'tavern',
  'forest',
  'river',
  'mountain',
  'snow',
  'interior',
  'VILLAGE_SQUARE',
  'VILLAGE_SIDE_STREET',
  'MARKET_STREET',
  'RESIDENTIAL_LANE',
  'BAKERY_EXTERIOR',
  'BAKERY_INTERIOR',
  'SHOP_EXTERIOR',
  'SHOP_INTERIOR',
  'COZY_HOME_INTERIOR',
  'FOREST_PATH',
  'FOREST_CLEARING',
  'DEEP_FOREST',
  'MAGICAL_FOREST',
  'RIVERBANK',
  'RIVER_CROSSING',
  'BRIDGE',
  'MEADOW',
  'FLOWER_FIELD',
  'HILLTOP',
  'COUNTRY_ROAD',
  'FARM_EDGE',
  'PICNIC_AREA',
  'POND',
  'LAKE_EDGE',
  'ROCKY_TRAIL',
  'MOUNTAIN_OVERLOOK',
  'CAVE_ENTRANCE',
  'CAVE_INTERIOR',
  'BEACH',
  'COASTAL_PATH',
  'SNOW_FIELD',
  'SNOW_VILLAGE',
  'AUTUMN_FOREST',
  'SPRING_MEADOW',
  'RAINY_STREET',
  'FESTIVAL_VILLAGE',
  'NIGHT_VILLAGE',
  'MAGICAL_NIGHT_CLEARING',
  'AMUSEMENT_PATH',
  'AMUSEMENT_PLAZA',
  'BACKSTAGE_SERVICE_PATH',
  'TAVERN_EXTERIOR',
  'TAVERN_INTERIOR',
] as const;
export type WorldBuilderArchetype = (typeof WORLD_BUILDER_ARCHETYPES)[number];

export const COMMERCIAL_EXTENSIONS = [
  '.blend',
  '.fbx',
  '.glb',
  '.gltf',
  '.obj',
  '.mtl',
  '.zip',
  '.paq',
  '.scatpack',
  '.unitypackage',
  '.hdr',
  '.exr',
  '.tga',
] as const;

export const SAFETY_DEFAULTS = {
  productionMutation: false,
  commercialSourceModified: false,
  commercialBytesCommitted: false,
  commercialBytesRedistributed: false,
  embeddedScriptsExecuted: false,
  addonsInstalled: false,
  botaniqActivated: false,
  geoScatterIntegrated: false,
  gafferActivated: false,
  physicalStarlightActivated: false,
  runPodMutation: false,
  gpuLaunched: false,
  paidComputeUsd: 0,
  assetsAutoApproved: false,
  pipGoatMutated: false,
  voiceIdentityMutated: false,
} as const;

export type SafetyReport = {
  productionMutation: false;
  commercialSourceModified: false;
  commercialBytesCommitted: false;
  commercialBytesRedistributed: false;
  embeddedScriptsExecuted: false;
  addonsInstalled: false;
  botaniqActivated: false;
  geoScatterIntegrated: false;
  gafferActivated: false;
  physicalStarlightActivated: false;
  runPodMutation: false;
  gpuLaunched: false;
  paidComputeUsd: 0;
  assetsAutoApproved: false;
  pipGoatMutated: false;
  voiceIdentityMutated: false;
};

export type StorageState = 'STORED' | 'MISSING' | 'UNKNOWN';
export type CanonicalSourceRelation = 'DIRECT_ORIGINAL' | 'WRAPPER' | 'HISTORICAL_VERSION' | 'DUPLICATE' | 'UNKNOWN';

export type AbstractSourceReceipt = {
  sourceId: string;
  sourceReceiptRef: string | null;
  storedByteSize: number | null;
  sourceSha256: string | null;
  storageState: StorageState;
  provenanceState: ProvenanceState;
  licenseState: LicenseState;
  canonicalSourceRelation: CanonicalSourceRelation;
  originalFilename?: string;
  displayName?: string;
  formatHint?: string;
  catalogPresent: boolean;
  receiptPresent: boolean;
  packageFamily?: string;
  packageVersion?: string;
  wrapperOfSourceId?: string | null;
  historicalOfSourceId?: string | null;
  notes?: string[];
};

export type MaterializationLimits = {
  maxByteBudget: number;
  timeoutMs: number;
};

export const DEFAULT_MATERIALIZATION_LIMITS: MaterializationLimits = {
  maxByteBudget: 512 * 1024 * 1024,
  timeoutMs: 30_000,
};

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 8_000,
  maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
  maxEntryUncompressedBytes: 512 * 1024 * 1024,
  maxCompressionRatio: 80,
  maxNestedDepth: 2,
  maxNestedArchives: 16,
};

export type ArchiveLimits = {
  maxEntries: number;
  maxUncompressedBytes: number;
  maxEntryUncompressedBytes: number;
  maxCompressionRatio: number;
  maxNestedDepth: number;
  maxNestedArchives: number;
};
