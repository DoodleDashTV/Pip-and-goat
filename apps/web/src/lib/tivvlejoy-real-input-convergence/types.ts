export const REAL_INPUT_SCHEMA = 'TIVVLEJOY_REAL_INPUT_CONVERGENCE_V1' as const;
export const PRIVATE_INVENTORY_SCHEMA = 'TIVVLEJOY_REAL_PRIVATE_OBJECT_INVENTORY_V1' as const;
export const STATIC_INSPECTION_PASS_SCHEMA = 'TIVVLEJOY_REAL_SCENERY_STATIC_INSPECTION_PASS_V1' as const;
export const VOICE_CONVERGENCE_SCHEMA = 'TIVVLEJOY_REAL_VOICE_RECEIPT_CONVERGENCE_V1' as const;
export const RIG_ARRIVAL_SCHEMA = 'TIVVLEJOY_REAL_RIG_ARRIVAL_READINESS_V1' as const;
export const FIRST_EPISODE_PREFLIGHT_SCHEMA = 'TIVVLEJOY_FIRST_EPISODE_PREFLIGHT_V1' as const;
export const GAP_LEDGER_SCHEMA = 'TIVVLEJOY_REAL_PRODUCTION_GAP_LEDGER_V1' as const;
export const PRODUCTION_LOCK_SCHEMA = 'TIVVLEJOY_FIRST_EPISODE_PRODUCTION_LOCK_V1' as const;
export const BLENDER_INSTALL_SCHEMA = 'TIVVLEJOY_BLENDER_INSTALLATION_PLAN_V1' as const;
export const MATERIALIZATION_BUDGET_SCHEMA = 'TIVVLEJOY_REAL_SOURCE_MATERIALIZATION_V1' as const;

export const EVIDENCE_BADGES = ['REAL', 'SYNTHETIC', 'PENDING', 'HUMAN APPROVAL', 'PAID AUTH'] as const;
export type EvidenceBadge = (typeof EVIDENCE_BADGES)[number];

export const PREFLIGHT_STATES = [
  'REAL_READY',
  'REAL_PARTIAL',
  'SYNTHETIC_ONLY',
  'WAITING_EXTERNAL_INPUT',
  'WAITING_HUMAN_APPROVAL',
  'WAITING_PAID_AUTHORIZATION',
  'BLOCKED',
] as const;
export type PreflightState = (typeof PREFLIGHT_STATES)[number];

export const HASH_STATES = [
  'HASH_VERIFIED',
  'HASH_MISMATCH',
  'HASH_MISSING_EXPECTED',
  'HASH_UNAVAILABLE',
  'READ_FAILED',
] as const;
export type HashState = (typeof HASH_STATES)[number];

export const MATCH_STATES = [
  'RECEIPT_OBJECT_MATCHED',
  'RECEIPT_MISSING_OBJECT',
  'OBJECT_MISSING_RECEIPT',
  'SIZE_MISMATCH',
  'HASH_MISSING',
  'DUPLICATE_STORED_OBJECT',
  'WRAPPER_OBJECT',
  'HISTORICAL_OBJECT',
  'UNKNOWN_OBJECT',
] as const;
export type MatchState = (typeof MATCH_STATES)[number];

export const TIMING_REALITY = [
  'REAL_EXACT_TIMING',
  'REAL_WORD_TIMING',
  'REAL_LINE_TIMING',
  'REAL_AUDIO_NO_TIMING',
  'MISSING_REAL_AUDIO',
  'SYNTHETIC_ONLY',
] as const;
export type TimingReality = (typeof TIMING_REALITY)[number];

export const RIG_ARRIVAL_STATES = [
  'NOT_PRESENT',
  'STORED',
  'HASH_VERIFIED',
  'INSPECTION_REQUIRED',
  'CAPABILITY_CHECK',
  'VISUAL_REVIEW',
  'HUMAN_APPROVAL_REQUIRED',
] as const;
export type RigArrivalState = (typeof RIG_ARRIVAL_STATES)[number];

export const SCENERY_GAP_KINDS = [
  'REAL_APPROVED',
  'REAL_INSPECTED_NOT_APPROVED',
  'SYNTHETIC_ONLY',
  'NATIVE_PROCEDURAL',
  'MISSING',
] as const;
export type SceneryGapKind = (typeof SCENERY_GAP_KINDS)[number];

export const DEFAULT_READ_BUDGET = {
  schemaVersion: MATERIALIZATION_BUDGET_SCHEMA,
  maxSingleObjectBytes: 8 * 1024 * 1024,
  maxTotalMaterializedBytes: 24 * 1024 * 1024,
  maxConcurrentDownloads: 2,
  timeoutMs: 20_000,
  headerOnlyBytes: 64,
  billingUncertainty: true,
  botaniqHold: true,
  addonHold: true,
} as const;

export type ReadBudget = {
  schemaVersion: typeof MATERIALIZATION_BUDGET_SCHEMA;
  maxSingleObjectBytes: number;
  maxTotalMaterializedBytes: number;
  maxConcurrentDownloads: number;
  timeoutMs: number;
  headerOnlyBytes: number;
  billingUncertainty: boolean;
  botaniqHold: boolean;
  addonHold: boolean;
};

export const EP012_REQUIRED_ROLES = [
  'BUILDING_HERO',
  'SIGNAGE',
  'STREET_PROP',
  'STORY_PROP',
  'PATH',
  'TREE_HERO',
  'TERRAIN_SURFACE',
  'FOREGROUND_FRAME',
  'BACKGROUND_FILL',
  'SKY',
] as const;
export type Ep012RequiredRole = (typeof EP012_REQUIRED_ROLES)[number];

export const FIRST_EPISODE_ID = 'EP012' as const;
export const FIRST_EPISODE_VERSION = 'ep012-plan-v1' as const;
export const FIRST_EPISODE_TITLE = 'The Bakery Map' as const;

export const PACKAGE_ROLES = [
  'RECEIPT_METADATA',
  'DIRECT_GLB',
  'DIRECT_FBX',
  'BLEND_SOURCE',
  'SMALL_ZIP',
  'TEXTURE_PACKAGE',
  'VILLAGE_PACKAGE',
  'FOREST_PACKAGE',
  'SKY_HDRI_PACKAGE',
  'MOUNTAIN_PACKAGE',
  'TAVERN_PACKAGE',
  'BOTANIQ_ARCHIVE',
  'OPTIONAL_ADDON',
  'HISTORICAL_DUPLICATE',
  'WRAPPER',
  'UNKNOWN',
] as const;
export type PackageRole = (typeof PACKAGE_ROLES)[number];

export const ACTIVATION_POLICIES = [
  'INSPECTION_CANDIDATE',
  'METADATA_ONLY',
  'NOT_ACTIVATED',
  'OPTIONAL_NOT_ACTIVATED',
  'HELD_LARGE_ARCHIVE',
] as const;
export type ActivationPolicy = (typeof ACTIVATION_POLICIES)[number];

export const QUALITY_TIERS = ['HERO', 'SUPPORTING', 'BACKGROUND'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const DEPTH_TIERS = ['FOREGROUND', 'MIDGROUND', 'BACKGROUND'] as const;
export type DepthTier = (typeof DEPTH_TIERS)[number];

export const STYLE_STATES = ['EXACT', 'HARMONIZABLE', 'INCOMPATIBLE', 'UNKNOWN'] as const;
export type StyleState = (typeof STYLE_STATES)[number];

export const WORLD_BUILDER_FEED_STATES = ['AVAILABLE_FOR_REVIEW', 'RESOLVED_APPROVED'] as const;
export type WorldBuilderFeedState = (typeof WORLD_BUILDER_FEED_STATES)[number];

export const LOCK_STATES = ['NOT_LOCKABLE', 'LOCKABLE'] as const;
export type LockState = (typeof LOCK_STATES)[number];

export const REAL_EVIDENCE_EVENTS = [
  'REAL_SOURCE_LISTED',
  'REAL_SOURCE_MATERIALIZED',
  'REAL_SOURCE_HASH_VERIFIED',
  'REAL_SOURCE_STATIC_INSPECTED',
  'REAL_LOGICAL_CHILD_DISCOVERED',
  'REAL_VISUAL_REVIEW_REQUESTED',
  'REAL_VOICE_RECEIPT_BOUND',
  'FIRST_EPISODE_PREFLIGHT_COMPILED',
] as const;
export type RealEvidenceEvent = (typeof REAL_EVIDENCE_EVENTS)[number];

export const PREFLIGHT_SUBSYSTEMS = [
  'SCRIPT',
  'VOICE',
  'SCENERY',
  'RIGS',
  'DIRECTING',
  'ANIMATION',
  'CAMERA',
  'STAGING',
  'LIGHTING',
  'VFX',
  'EDITORIAL',
  'AUDIO',
  'CAPTIONS',
  'SHOT_REVIEW',
  'ASSEMBLY',
  'BLENDER',
  'RENDER',
  'QC',
  'DELIVERY',
] as const;
export type PreflightSubsystem = (typeof PREFLIGHT_SUBSYSTEMS)[number];

export const SHOT_MATRIX_COLUMNS = [
  'script',
  'voice',
  'camera',
  'staging',
  'scenery',
  'rig',
  'animation',
  'visualApproval',
  'renderReadiness',
  'qc',
] as const;
export type ShotMatrixColumn = (typeof SHOT_MATRIX_COLUMNS)[number];

export const EP012_DIALOGUE_REFS = [
  'DL_HOOK_01',
  'DL_DISCOVERY_01',
  'DL_DECISION_01',
  'DL_ACTION_01',
  'DL_COMPLICATION_01',
  'DL_PAYOFF_01',
  'DL_BUTTON_01',
] as const;
export type Ep012DialogueRef = (typeof EP012_DIALOGUE_REFS)[number];

export const RIG_ALLOWED_EXTENSIONS = ['.blend', '.glb', '.fbx'] as const;
export const RIG_MIN_BYTES = 1024;
// The verified Goat live working blend is 298,161,606 bytes. Keep a hard
// intake ceiling while leaving enough room for that known-good production size.
export const RIG_MAX_BYTES = 384 * 1024 * 1024;
export const RIG_MAX_BYTES_BY_EXTENSION = {
  '.blend': RIG_MAX_BYTES,
  '.glb': 256 * 1024 * 1024,
  '.fbx': 256 * 1024 * 1024,
} as const;

export const PRIORITY_QUEUE_ORDER = [
  'direct_mountain_glb',
  'smaller_mountain_zip',
  'tavern_fbx',
  'tavern_textures',
  'tavern_blend_header',
  'village_evidence',
  'forest',
  'sky_hdri',
  'large_historical_optional_addon',
] as const;
export type PriorityQueueLabel = (typeof PRIORITY_QUEUE_ORDER)[number];

export type ListedPrivateObject = {
  objectIdentity: string;
  operatorLabel: string;
  size: number;
  etag: string | null;
  extension: string;
  receiptRelationship: string | null;
  catalogSourceId: string | null;
  knownSourceSha256: string | null;
  knownUploadReceipt: string | null;
  knownPackageRole: PackageRole;
  knownActivationPolicy: ActivationPolicy;
  filenameUsedAsIdentity: false;
};

export type PrivateObjectInventory = {
  schemaVersion: typeof PRIVATE_INVENTORY_SCHEMA;
  listingExecuted: boolean;
  realPrivateSourceAccessAvailable: boolean;
  objectCount: number;
  totalBytes: number;
  extensionCounts: Record<string, number>;
  objects: ListedPrivateObject[];
  hardcodedObjectTotal: false;
  credentialsPrinted: false;
  commercialBytesDownloaded: number;
  r2Mutated: false;
  blocker: string | null;
};

export type MatchCounts = {
  receiptObjectMatched: number;
  receiptMissingObject: number;
  objectMissingReceipt: number;
  sizeMismatch: number;
  hashMissing: number;
  duplicateStoredObject: number;
  wrapperObject: number;
  historicalObject: number;
  unknownObject: number;
};

export type ObjectReceiptMatch = {
  objectIdentity: string | null;
  sourceId: string | null;
  receiptRef: string | null;
  state: (typeof MATCH_STATES)[number];
  expectedSize: number | null;
  observedSize: number | null;
  expectedSha256: string | null;
};

export type ReceiptObjectReconciliation = {
  schemaVersion: 'TIVVLEJOY_RECEIPT_OBJECT_MATCHING_V1';
  matches: ObjectReceiptMatch[];
  counts: MatchCounts;
};

export type PriorityQueueItem = {
  objectIdentity: string;
  operatorLabel: string;
  priority: number;
  queueLabel: PriorityQueueLabel;
  size: number;
  extension: string;
  held: boolean;
  holdReason: string | null;
  selected: boolean;
};

export type HashVerification = {
  sourceId: string;
  objectIdentity: string | null;
  observedSha256: string | null;
  expectedSha256: string | null;
  clientSha256: string | null;
  state: HashState;
  streamed: true;
  sourceMutated: false;
};

export type RealStaticInspection = {
  evidenceClass: 'REAL_SOURCE_INSPECTION';
  sourceId: string;
  objectIdentity: string | null;
  format: 'GLB' | 'GLTF' | 'FBX' | 'BLEND' | 'ZIP' | 'JSON' | 'OTHER';
  hash: HashVerification;
  archiveSafe: boolean | null;
  glb: Record<string, unknown> | null;
  fbx: Record<string, unknown> | null;
  blendHeader: Record<string, unknown> | null;
  logicalChildren: number;
  deepBlenderInspectionPending: boolean;
  quarantined: boolean;
  notes: string[];
};

export type RealLogicalCandidate = {
  assetCandidateId: string;
  sourceId: string;
  sourceSha256: string | null;
  roles: string[];
  quality: QualityTier[];
  depth: DepthTier[];
  style: StyleState;
  styleConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  heroCandidate: boolean;
  interiorCandidate: boolean;
  mountainCandidate: boolean;
  propCandidate: boolean;
  readyForVisualReview: boolean;
  technicallyBlocked: boolean;
  worldBuilderFeed: WorldBuilderFeedState;
  selectableApprovedAsset: false;
  humanApproved: false;
  evidenceRefs: string[];
};

export type VoiceLineBinding = {
  dialogueRef: string;
  characterId: string | null;
  receiptRef: string | null;
  receiptSha256: string | null;
  timingReality: TimingReality;
  realReceipt: boolean;
  syntheticOnly: boolean;
  blocker: string | null;
};

export type VoiceConvergence = {
  schemaVersion: typeof VOICE_CONVERGENCE_SCHEMA;
  episodeId: typeof FIRST_EPISODE_ID;
  pipConfirmedRealReceipts: number;
  goatConfirmedRealReceipts: number;
  lineTimingReceipts: number;
  wordTimingReceipts: number;
  exactTimingReceipts: number;
  missingAudioReceipts: number;
  staleReceipts: number;
  bindings: VoiceLineBinding[];
  externalVoiceVendorCalled: false;
  voiceIdentityMutated: false;
};

export type RigIntakeRecord = {
  schemaVersion: typeof RIG_ARRIVAL_SCHEMA;
  characterId: 'PIP' | 'GOAT';
  state: RigArrivalState;
  sourcePresent: boolean;
  stored: boolean;
  hashVerified: boolean;
  observedSha256: string | null;
  byteSize: number | null;
  extension: string | null;
  evidenceClass: 'REAL_RIG_INTAKE' | 'SYNTHETIC_FIXTURE';
  autoApproved: false;
  priorVersionOverwritten: false;
  filenameUsedAsIdentity: false;
  blocker: string | null;
};

export type SubsystemPreflight = {
  subsystem: PreflightSubsystem;
  state: PreflightState;
  evidenceBadge: EvidenceBadge;
  blocker: string | null;
  syntheticCannotSatisfy: true;
};

export type ShotPreflightRow = {
  shotId: string;
  columns: Record<ShotMatrixColumn, PreflightState>;
  exactBlocker: string;
  evidenceBadge: EvidenceBadge;
};

export type FirstEpisodePreflight = {
  schemaVersion: typeof FIRST_EPISODE_PREFLIGHT_SCHEMA;
  episodeId: typeof FIRST_EPISODE_ID;
  episodeVersion: typeof FIRST_EPISODE_VERSION;
  title: typeof FIRST_EPISODE_TITLE;
  subsystems: SubsystemPreflight[];
  shots: ShotPreflightRow[];
  shotCount: number;
  realReadyShots: number;
  partialShots: number;
  blockedShots: number;
  syntheticCannotSatisfyRealPreflight: true;
  lockState: LockState;
};

export type ProductionGap = {
  gapId: string;
  category: string;
  exactDependency: string;
  affectedEpisodes: string[];
  affectedShots: string[];
  resolutionType: string;
  requiresHuman: boolean;
  requiresExternalFile: boolean;
  requiresPaidAction: boolean;
  priority: number;
  blockingCriticalPath: boolean;
  evidenceSha256: string;
};

export type GapLedger = {
  schemaVersion: typeof GAP_LEDGER_SCHEMA;
  gaps: ProductionGap[];
  readyWhileWaiting: string[];
};

export type MorningBrief = {
  whatChanged: string[];
  whatIsReal: string[];
  whatIsStillSynthetic: string[];
  whatNeedsJustin: string[];
  whatNeedsMichaelOrRigger: string[];
  whatCouldCostMoney: string[];
  next5SafeActions: string[];
  secretsIncluded: false;
};

export type BlenderInstallationPlan = {
  schemaVersion: typeof BLENDER_INSTALL_SCHEMA;
  requiredVersion: string;
  trustedSource: string;
  checksumExpectation: string;
  installLocation: string;
  networkRestrictions: string[];
  testCommand: string;
  rollbackRemoval: string;
  installedNow: false;
  reasonNotInstalled: string;
};

export type ApprovalCounts = {
  realSourcesDownloaded: number;
  realHashesVerified: number;
  realSourcesStaticallyInspected: number;
  realLogicalChildrenDiscovered: number;
  realHeroCandidates: number;
  realInteriorCandidates: number;
  realMountainCandidates: number;
  realPropCandidates: number;
  realCandidatesReadyForVisualReview: number;
  realCandidatesTechnicallyBlocked: number;
  humanSceneryApprovalsIssued: 0;
  realApprovedLogicalAssets: 0;
};
