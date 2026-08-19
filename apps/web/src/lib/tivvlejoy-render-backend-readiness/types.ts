export const RENDER_BACKEND_READINESS_SCHEMA = 'TIVVLEJOY_RENDER_BACKEND_READINESS_V1' as const;
export const PAID_RENDER_AUTHORIZATION_SCHEMA = 'TIVVLEJOY_PAID_RENDER_AUTHORIZATION_V1' as const;
export const SHOT_VISUAL_APPROVAL_SCHEMA = 'TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1' as const;
export const BACKEND_IDENTITY_SCHEMA = 'TIVVLEJOY_RENDER_BACKEND_IDENTITY_V1' as const;

export const READINESS_ACTIVE_STATES = [
  'DRAFT',
  'VALIDATING_HASHES',
  'VALIDATING_ASSETS',
  'VALIDATING_SHOT',
  'ESTIMATING_COST',
  'ZERO_GPU_READY',
  'BACKEND_READY_PAID_AUTH_REQUIRED',
] as const;

export const READINESS_BLOCKED_STATES = [
  'BLOCKED_HASH_MISMATCH',
  'BLOCKED_ASSET_UNAPPROVED',
  'BLOCKED_ASSET_MISSING',
  'BLOCKED_ASSET_QUARANTINED',
  'BLOCKED_SHOT_UNAPPROVED',
  'BLOCKED_VISUAL_APPROVAL_STALE',
  'BLOCKED_BACKEND_MISMATCH',
  'BLOCKED_COST_ABOVE_CAP',
  'BLOCKED_RUNTIME_ABOVE_CAP',
  'BLOCKED_ESTIMATE_LOW_CONFIDENCE',
  'BLOCKED_PAID_AUTHORIZATION',
  'BLOCKED_SECRET_SAFETY',
  'BLOCKED_UNKNOWN',
] as const;

export const FORBIDDEN_PREVIEW_RENDER_STATES = ['RUNNING', 'GPU_STARTING', 'RENDERING'] as const;

export type ReadinessActiveState = (typeof READINESS_ACTIVE_STATES)[number];
export type ReadinessBlockedState = (typeof READINESS_BLOCKED_STATES)[number];
export type ReadinessStatus = ReadinessActiveState | ReadinessBlockedState;

export const RENDER_PROFILES = ['PLANNING', 'THUMBNAIL', 'REVIEW', 'FINAL'] as const;
export type RenderProfile = (typeof RENDER_PROFILES)[number];

export const ASSET_ROLES = [
  'CHARACTER',
  'ENVIRONMENT',
  'PROP',
  'ANIMATION',
  'CAMERA',
  'LIGHTING',
  'MATERIAL_PROFILE',
  'STYLE_PROFILE',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const VISUAL_APPROVAL_RESULTS = [
  'VISUALLY_EXCELLENT',
  'VISUALLY_APPROVED',
  'REVISION_REQUIRED',
  'VISUAL_REJECT',
] as const;
export type VisualApprovalResult = (typeof VISUAL_APPROVAL_RESULTS)[number];

export const CACHE_ELIGIBILITY = ['CACHE_REUSE_ELIGIBLE', 'CACHE_REUSE_NOT_ELIGIBLE'] as const;
export type CacheEligibility = (typeof CACHE_ELIGIBILITY)[number];

export const ESTIMATE_CONFIDENCE = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type EstimateConfidence = (typeof ESTIMATE_CONFIDENCE)[number];

export const READINESS_MODES = ['OFFLINE_READINESS', 'LIVE_READONLY_PREFLIGHT'] as const;
export type ReadinessMode = (typeof READINESS_MODES)[number];

export type AssetRenderReceipt = {
  assetId: string;
  assetVersion: string;
  assetRole: AssetRole;
  objectKey: string;
  sha256: string;
  bytes: number;
  sourceVerified: boolean;
  hashVerified: boolean;
  approvalStatus: 'approved' | 'unapproved' | 'quarantined' | 'fixture_only';
  quarantined: boolean;
  provenanceValid: boolean;
  heroSafe: boolean;
  backgroundSafe: boolean;
  stylizationApproval: 'approved' | 'unapproved' | 'not_required';
  receiptId: string;
};

export type CharacterVersionLock = {
  pipAssetVersion: string;
  pipRigVersion: string;
  goatAssetVersion: string;
  goatRigVersion: string;
};

export type ShotVisualApprovalReceipt = {
  schemaVersion: typeof SHOT_VISUAL_APPROVAL_SCHEMA;
  visualApprovalVersion: string;
  shotId: string;
  shotDependencySha256: string;
  score: number;
  result: VisualApprovalResult;
  hardBlockers: string[];
  approvedAt: string;
  reviewerMode: 'HUMAN' | 'FIXTURE' | 'ADAPTER';
};

export type ShotDependencyInput = CharacterVersionLock & {
  camera: string;
  frameStart: number;
  frameEnd: number;
  animation: string;
  visibleGeometry: string[];
  environmentPreset: string;
  visibleProps: string[];
  materials: string[];
  styleProfile: string;
  lighting: string;
  worldHdri: string;
  renderSettings: string;
  resolution: string;
  fps: number;
  blenderVersion: string;
};

export type JobPackageInput = CharacterVersionLock & {
  productionId: string;
  episodeId: string;
  shotId: string;
  frameStart: number;
  frameEnd: number;
  fps: number;
  resolution: string;
  renderEngine: string;
  renderProfile: RenderProfile;
  blenderVersion: string;
  templateId: string;
  workerImageDigest: string;
  assetReceipts: AssetRenderReceipt[];
  shotDependencySha256: string;
  outputDestinationIdentity: string;
};

export type BackendIdentityRecord = {
  schemaVersion: typeof BACKEND_IDENTITY_SCHEMA;
  templateId: string;
  templateName: string;
  workerImageDigest: string;
  templateReceiptHash: string;
  provenance: 'TEMPLATE_READY';
  provenAttempt: 'PAID_SMOKE_TEST_PASS';
  historicalAttempt1TemplateId: string;
  mutableTagsRefused: readonly string[];
};

export type CostEstimateInput = {
  frameCount: number;
  resolution: string;
  samples: number;
  renderEngine: string;
  renderProfile: RenderProfile;
  visibleTriangles?: number;
  textureVramMb?: number;
  uniqueMaterials?: number;
  lights?: number;
  shadowCasters?: number;
  volumetrics?: boolean;
  transparentSurfaces?: number;
  simulations?: boolean;
  geometryNodesComplexity?: number;
  scatterDensity?: number;
  hourlyRateUsd: number;
};

export type CostEstimate = {
  estimatedStartupSeconds: number;
  estimatedRenderSeconds: number;
  estimatedEncodeSeconds: number;
  estimatedUploadSeconds: number;
  estimatedTotalSeconds: number;
  hourlyRateUsd: number;
  estimatedComputeUsd: number;
  worstCaseComputeUsd: number;
  estimateConfidence: EstimateConfidence;
  telemetrySource: string | null;
};

export type LiveReadonlyObservation = {
  templateReady?: boolean;
  compatibleCount?: number;
  preexistingPodCount?: number;
  hourlyRateUsd?: number;
  stockVerified?: boolean;
};

export type MutationCounts = {
  postPods: number;
  deletePods: number;
  patchPods: number;
  postTemplates: number;
  patchTemplates: number;
  deleteTemplates: number;
};

export type PaidRenderAuthorization = {
  schemaVersion: typeof PAID_RENDER_AUTHORIZATION_SCHEMA;
  authorizationId: string;
  jobId: string;
  launchIntentSha256: string;
  templateId: string;
  workerImageDigest: string;
  gpuType: string;
  cloudType: string;
  gpuCount: number;
  maximumHourlyUsd: number;
  maximumComputeUsd: number;
  maximumRuntimeMinutes: number;
  authorizedBy: string;
  authorizedAt: string;
  expiresAt: string;
  maxPodCreates: 1;
  issued: false;
};

export type RenderBackendReadinessReceipt = {
  schemaVersion: typeof RENDER_BACKEND_READINESS_SCHEMA;
  status: ReadinessStatus;
  jobId: string;
  productionId: string;
  episodeId: string;
  shotId: string;
  renderProfile: RenderProfile;
  templateId: string;
  templateName: string;
  workerImageDigest: string;
  templateReceiptHash: string;
  jobPackageSha256: string;
  workerManifestSha256: string;
  shotDependencySha256: string;
  launchIntentSha256: string;
  assetsRequired: number;
  assetsApproved: number;
  assetReceipts: AssetRenderReceipt[];
  shotApproved: boolean;
  visualApprovalVersion: string | null;
  visualScore: number | null;
  visualResult: VisualApprovalResult | null;
  hardBlockers: string[];
  cacheEligibility: CacheEligibility;
  estimatedStartupSeconds: number | null;
  estimatedRenderSeconds: number | null;
  estimatedTotalSeconds: number | null;
  hourlyRateUsd: number | null;
  estimatedComputeUsd: number | null;
  worstCaseComputeUsd: number | null;
  estimateConfidence: EstimateConfidence | null;
  gpuLaunched: false;
  paidCompute: false;
  providerMutationCount: 0;
  paidAuthorization: 'REQUIRED';
  providerContacted: boolean;
  livePriceVerified: boolean;
  launchAuthorized: false;
  mode: ReadinessMode;
  blockingReason: string | null;
  createdAt: string;
};

export type PreviewReadinessCard = {
  episodeLabel: string;
  shotLabel: string;
  status: ReadinessStatus;
  backendProven: boolean;
  hashesVerified: boolean;
  assetsApprovedLabel: string;
  shotApprovalLabel: string;
  cacheLabel: string;
  estimatedRuntimeLabel: string;
  gpuLabel: string;
  hourlyQuoteLabel: string;
  estimatedComputeLabel: string;
  maximumCostLabel: string;
  providerContacted: false;
  gpuLaunched: false;
  paidAuthorization: 'REQUIRED';
  blockingReason: string | null;
};

export const ZERO_MUTATIONS: MutationCounts = Object.freeze({
  postPods: 0,
  deletePods: 0,
  patchPods: 0,
  postTemplates: 0,
  patchTemplates: 0,
  deleteTemplates: 0,
});

export const FORBIDDEN_RECEIPT_KEYS = Object.freeze([
  'RUNPOD_API_KEY',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'Authorization',
  'authorization',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'VERCEL_TOKEN',
]);
