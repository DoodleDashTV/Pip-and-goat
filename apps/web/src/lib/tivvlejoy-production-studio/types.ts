export const STATE_GRAPH_SCHEMA = 'TIVVLEJOY_PRODUCTION_STATE_GRAPH_V1' as const;
export const PRODUCTION_PACKET_SCHEMA = 'TIVVLEJOY_EPISODE_PRODUCTION_PACKET_V1' as const;
export const CONTINUITY_LEDGER_SCHEMA = 'TIVVLEJOY_CONTINUITY_LEDGER_V1' as const;
export const BATCH_PLAN_SCHEMA = 'TIVVLEJOY_BATCH_PLAN_V1' as const;
export const BATCH_SCHEDULER_SCHEMA = 'TIVVLEJOY_BATCH_PRODUCTION_SCHEDULER_V1' as const;
export const RECOVERY_SCHEMA = 'TIVVLEJOY_PRODUCTION_RECOVERY_V1' as const;
export const EPISODE_QC_SCHEMA = 'TIVVLEJOY_EPISODE_QC_V1' as const;
export const DELIVERY_PACKAGE_SCHEMA = 'TIVVLEJOY_DELIVERY_PACKAGE_V1' as const;
export const ORCHESTRATOR_SCHEMA = 'TIVVLEJOY_PRODUCTION_STUDIO_ORCHESTRATOR_V1' as const;
export const SEASON_SIMULATION_SCHEMA = 'TIVVLEJOY_SEASON_SIMULATION_V1' as const;

export const GRAPH_NODE_KINDS = [
  'EPISODE',
  'SCRIPT',
  'VOICE',
  'LOCATION',
  'ASSET',
  'SHOT',
  'CHARACTER_RIG',
  'CAMERA',
  'LIGHTING',
  'ANIMATION',
  'SHOT_ASSEMBLY',
  'VISUAL_APPROVAL',
  'RENDER_PREFLIGHT',
  'RENDER',
  'AUDIO',
  'QC',
  'DELIVERY',
  'DIRECTING',
  'STAGING',
  'EDITORIAL',
  'AUDIO_DESIGN',
  'CAPTIONS',
  'SHOT_REVIEW',
] as const;
export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

export const GRAPH_STATES = [
  'NOT_STARTED',
  'PLANNED',
  'WAITING_FOR_DEPENDENCY',
  'WAITING_FOR_ASSET',
  'WAITING_FOR_RIG',
  'WAITING_FOR_RIG_APPROVAL',
  'WAITING_FOR_VOICE',
  'WAITING_FOR_VOICE_TIMING',
  'WAITING_FOR_CONTINUITY',
  'WAITING_FOR_ANIMATION_PLAN',
  'WAITING_FOR_ANIMATION_QC',
  'READY_FOR_CHARACTER_ANIMATION_ASSEMBLY',
  'WAITING_FOR_APPROVAL',
  'READY_FOR_SAFE_PLANNING',
  'READY_FOR_ASSEMBLY',
  'READY_FOR_RENDER_PREFLIGHT',
  'WAITING_FOR_DIRECTION',
  'WAITING_FOR_CAMERA_PLAN',
  'WAITING_FOR_STAGING',
  'WAITING_FOR_EDIT',
  'WAITING_FOR_AUDIO_PLAN',
  'WAITING_FOR_CAPTIONS',
  'WAITING_FOR_DIRECTOR_REVIEW',
  'WAITING_FOR_SHOT_APPROVAL',
  'BLOCKED',
  'COMPLETE',
] as const;
export type GraphState = (typeof GRAPH_STATES)[number];

export const BLOCKER_CLASSES = [
  'TECHNICAL',
  'CREATIVE',
  'APPROVAL',
  'ASSET',
  'RIG',
  'VOICE',
  'RENDER',
  'DELIVERY',
] as const;
export type BlockerClass = (typeof BLOCKER_CLASSES)[number];

export const PACKET_READINESS = ['PLANNING_COMPLETE', 'WAITING_FOR_DEPENDENCY', 'BLOCKED', 'REAL_PRODUCTION_READY'] as const;
export type PacketReadiness = (typeof PACKET_READINESS)[number];

export const CONTINUITY_STATUSES = ['CONTINUITY_VALID', 'CONTINUITY_MISSING', 'CONTINUITY_STALE', 'CONTINUITY_CONFLICT'] as const;
export type ContinuityStatus = (typeof CONTINUITY_STATUSES)[number];

export const WORK_UNIT_TYPES = [
  'VOICE_PREP',
  'ENVIRONMENT_PREP',
  'ASSET_MATERIALIZATION',
  'SHOT_ASSEMBLY',
  'ANIMATION',
  'VISUAL_REVIEW',
  'RENDER_PREFLIGHT',
  'RENDER',
  'AUDIO_MUX',
  'QC',
  'DELIVERY',
] as const;
export type WorkUnitType = (typeof WORK_UNIT_TYPES)[number];

export const RETRY_CLASSES = [
  'SAFE_RETRY',
  'REQUIRES_REVALIDATION',
  'REQUIRES_HUMAN_REVIEW',
  'REQUIRES_NEW_AUTHORIZATION',
  'DO_NOT_RETRY',
] as const;
export type RetryClass = (typeof RETRY_CLASSES)[number];

export const QC_STATES = ['PASS', 'WARNING', 'FAIL', 'NOT_EVALUATED'] as const;
export type QcState = (typeof QC_STATES)[number];

export const DELIVERY_READINESS = ['NOT_READY', 'QC_BLOCKED', 'WAITING_FOR_APPROVAL', 'READY_FOR_MANUAL_RELEASE'] as const;
export type DeliveryReadiness = (typeof DELIVERY_READINESS)[number];

export const STUDIO_READINESS = [
  'FOUNDATION',
  'PLANNING_OPERATIONAL',
  'ASSET_PIPELINE_OPERATIONAL',
  'SHOT_PIPELINE_OPERATIONAL',
  'PRODUCTION_ORCHESTRATION_OPERATIONAL',
  'WAITING_FOR_REAL_ASSETS',
  'WAITING_FOR_CHARACTER_RIGS',
  'READY_FOR_CONTROLLED_PRODUCTION_VALIDATION',
  'PRODUCTION_READY',
] as const;
export type StudioReadiness = (typeof STUDIO_READINESS)[number];

export const QC_PROFILES = {
  SHORT_15: { profileId: 'SHORT_15', width: 1080, height: 1920, aspect: '9:16', fps: 30, durationSec: 15 },
  SHORT_30: { profileId: 'SHORT_30', width: 1080, height: 1920, aspect: '9:16', fps: 30, durationSec: 30 },
  SHORT_60: { profileId: 'SHORT_60', width: 1080, height: 1920, aspect: '9:16', fps: 30, durationSec: 60 },
} as const;
export type QcProfileId = keyof typeof QC_PROFILES;

export type GraphNode = {
  nodeId: string;
  kind: GraphNodeKind;
  episodeId: string;
  shotId?: string;
  state: GraphState;
  blockerClass: BlockerClass | null;
  blockerCode: string | null;
  humanLabel: string;
  waitingOn: string[];
  dependencySha256: string | null;
  humanAuthorizationRequired: boolean;
};

export type GraphEdge = {
  from: string;
  to: string;
  reason: string;
};

export type ProductionJob = {
  jobId: string;
  jobType: WorkUnitType;
  episodeId: string;
  shotId?: string;
  inputDependencySha256: string;
  attemptNumber: number;
  idempotencyKey: string;
  checkpointRef: string | null;
  resultReceiptRef: string | null;
  retryClass: RetryClass;
  authorizationReceiptRef?: string | null;
};

export type ContinuityFact = {
  continuityFactId: string;
  continuityVersion: string;
  topic: string;
  subjectId: string;
  state: string;
  effectiveEpisode: string;
  effectiveShot: string | null;
  source: string;
  dependencySha256: string;
};

export type VoiceReceipt = {
  dialogueRef: string;
  receiptRef: string;
  receiptSha256: string;
  characterId: string;
};

export type VisualApprovalReceipt = {
  shotId: string;
  receiptRef: string;
  receiptSha256: string;
  stale?: boolean;
};
