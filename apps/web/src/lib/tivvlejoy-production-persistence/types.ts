export const PERSISTENCE_SCHEMA = 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V1' as const;
export const EVENT_JOURNAL_SCHEMA = 'TIVVLEJOY_PRODUCTION_EVENT_JOURNAL_V1' as const;
export const SNAPSHOT_SCHEMA = 'TIVVLEJOY_PRODUCTION_SNAPSHOT_V1' as const;
export const CONCURRENCY_SCHEMA = 'TIVVLEJOY_PRODUCTION_CONCURRENCY_V1' as const;
export const BACKUP_SCHEMA = 'TIVVLEJOY_PRODUCTION_BACKUP_V1' as const;
export const HEALTH_SCHEMA = 'TIVVLEJOY_PERSISTENCE_HEALTH_V1' as const;

export const PERSISTENCE_MODES = ['PREVIEW_MEMORY', 'PREVIEW_BROWSER', 'PREVIEW_DATABASE', 'PRODUCTION_DATABASE'] as const;
export type PersistenceMode = (typeof PERSISTENCE_MODES)[number];

export const WRITE_RESULTS = ['WRITE_ACCEPTED', 'WRITE_IDEMPOTENT', 'WRITE_CONFLICT', 'WRITE_STALE', 'WRITE_REJECTED'] as const;
export type WriteResult = (typeof WRITE_RESULTS)[number];

export const ENTITY_TYPES = [
  'WORKSPACE',
  'PRODUCTION',
  'SEASON',
  'EPISODE',
  'SCRIPT_VERSION',
  'VOICE_RECEIPT',
  'APPROVED_ASSET_REFERENCE',
  'LOCATION_INSTANCE',
  'SHOT',
  'PRODUCTION_PACKET',
  'PRODUCTION_STATE_NODE',
  'PRODUCTION_STATE_EDGE',
  'CONTINUITY_FACT',
  'BATCH_PLAN',
  'PRODUCTION_JOB',
  'RECOVERY_CHECKPOINT',
  'VISUAL_APPROVAL_REFERENCE',
  'RENDER_PREFLIGHT_REFERENCE',
  'RENDER_RECEIPT_REFERENCE',
  'QC_RECEIPT',
  'DELIVERY_PACKAGE',
  'AUDIT_EVENT',
  'RIG_ADMISSION_REPORT',
  'RIG_VERSION_IDENTITY',
  'PERFORMANCE_INTENT',
  'DIALOGUE_TIMING_PLAN',
  'VISEME_PLAN',
  'SHOT_ANIMATION_MANIFEST',
  'ANIMATION_QC_RECEIPT',
  'ANIMATION_CACHE_IDENTITY',
  'ANIMATION_BATCH_PLAN',
  'SCENERY_SOURCE_RECEIPT',
  'SCENERY_INSPECTION_RECEIPT',
  'SCENERY_LOGICAL_ASSET',
  'SCENERY_APPROVAL_RECEIPT',
  'SCENERY_VISUAL_EVIDENCE',
  'SCENERY_QUARANTINE',
  'SCENERY_PRODUCTION_LIBRARY',
  'SCENERY_REVIEW_DECISION',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const EVENT_TYPES = [
  'EPISODE_CREATED',
  'SCRIPT_VERSION_BOUND',
  'VOICE_RECEIPT_BOUND',
  'ASSET_RESOLUTION_BOUND',
  'CONTINUITY_FACT_ADDED',
  'SHOT_DEPENDENCY_CHANGED',
  'PRODUCTION_PACKET_COMPILED',
  'VISUAL_APPROVAL_RECORDED',
  'JOB_CHECKPOINT_WRITTEN',
  'QC_RECEIPT_RECORDED',
  'DELIVERY_PACKAGE_COMPILED',
  'STATE_GRAPH_SNAPSHOTTED',
  'BATCH_PLAN_WRITTEN',
  'WORKSPACE_SAVED',
  'BACKUP_EXPORTED',
  'WRITE_FAILED',
  'RIG_ADMISSION_RECORDED',
  'ANIMATION_PLAN_WRITTEN',
  'ANIMATION_QC_RECORDED',
  'SOURCE_MATERIALIZED',
  'SOURCE_HASH_VERIFIED',
  'ARCHIVE_INSPECTED',
  'STATIC_FORMAT_INSPECTED',
  'DEEP_INSPECTION_COMPLETED',
  'LOGICAL_ASSET_DISCOVERED',
  'SEMANTIC_CLASSIFICATION_RECORDED',
  'VISUAL_REVIEW_REQUESTED',
  'ASSET_APPROVED',
  'ASSET_REJECTED',
  'ASSET_ARCHIVED',
  'REGISTRY_UPDATED',
] as const;
export type JournalEventType = (typeof EVENT_TYPES)[number];

export const HEALTH_STATES = ['HEALTHY', 'DEGRADED', 'NOT_CONFIGURED', 'UNAVAILABLE', 'CORRUPT', 'CONFLICTED'] as const;
export type PersistenceHealth = (typeof HEALTH_STATES)[number];

export const MIGRATION_RESULTS = [
  'MIGRATION_NOT_REQUIRED',
  'MIGRATION_AVAILABLE',
  'MIGRATION_COMPLETE',
  'MIGRATION_BLOCKED',
  'UNSUPPORTED_FUTURE_SCHEMA',
] as const;
export type MigrationResult = (typeof MIGRATION_RESULTS)[number];

export const ACTOR_CLASSES = ['OPERATOR', 'SYSTEM', 'TEST', 'PREVIEW'] as const;
export type ActorClass = (typeof ACTOR_CLASSES)[number];

export type DurableRecord = {
  id: string;
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  schemaVersion: typeof PERSISTENCE_SCHEMA;
  entityVersion: string;
  dependencySha256: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  payload: Record<string, unknown>;
};

export type JournalEvent = {
  eventId: string;
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  eventType: JournalEventType;
  previousRevision: number;
  nextRevision: number;
  dependencySha256: string;
  payloadSha256: string;
  payload: Record<string, unknown>;
  timestamp: string;
  actorClass: ActorClass;
  reason: string;
};

export type ProductionSnapshot = {
  schemaVersion: typeof SNAPSHOT_SCHEMA;
  workspaceId: string;
  journalPosition: number;
  revision: number;
  snapshotSha256: string;
  records: DurableRecord[];
};

export type WriteReceipt = {
  result: WriteResult;
  revision: number;
  dependencySha256: string;
  reason: string;
  eventId?: string;
};

export type PersistenceHealthReport = {
  schemaVersion: typeof HEALTH_SCHEMA;
  mode: PersistenceMode;
  health: PersistenceHealth;
  durable: boolean;
  previewDatabase: 'CONNECTED' | 'NOT_CONNECTED' | 'ERROR';
  productionDatabase: 'NOT_CONNECTED' | 'CONNECTED';
  adapterSelected: PersistenceMode;
  schemaCompatible: boolean;
  snapshotIntegrity: boolean;
  journalIntegrity: boolean;
  revisionConsistent: boolean;
  detail: string;
};

export type WorkspaceBackup = {
  schemaVersion: typeof BACKUP_SCHEMA;
  workspaceId: string;
  entityCounts: Record<string, number>;
  snapshot: ProductionSnapshot;
  events: JournalEvent[];
  contentHashes: string[];
  backupSha256: string;
  secretsExcluded: true;
  commercialBytesExcluded: true;
};

export type DurableWorkspaceView = {
  workspaceId: string;
  revision: number;
  snapshotSha256: string;
  journalPosition: number;
  records: DurableRecord[];
  events: JournalEvent[];
};
