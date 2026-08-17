export const PREVIEW_ADAPTER_ID = 'preview-localStorage' as const;
export const PREVIEW_DATABASE_ADAPTER_ID = 'preview-database' as const;
export const PRODUCTION_ADAPTER_ID = 'production-database' as const;
export const TIVVLEJOY_RECORD_SCHEMA_VERSION = 1;

export const TIVVLEJOY_BACKUP_KIND = 'TIVVLEJOY_PREVIEW_BACKUP' as const;
export const TIVVLEJOY_BACKUP_VERSION = 1;
export const TIVVLEJOY_BACKUP_MAX_BYTES = 256 * 1024;

export type PersistenceAdapterId =
  | typeof PREVIEW_ADAPTER_ID
  | typeof PREVIEW_DATABASE_ADAPTER_ID
  | typeof PRODUCTION_ADAPTER_ID;
export type StudioRuntimeMode = 'preview' | 'production-incomplete' | 'production-ready';
export type ProviderMode = 'preview' | 'local' | 'production';

export type WorkspaceSettingsRecord = {
  id: string;
  projectName: string;
  format: '1080x1920';
  fps: 30;
  paidResourcesAuthorized: false;
  theatricalBindingCompleted: false;
  durable: boolean;
};

export type ProductionRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: 'PREVIEW' | 'DRAFT';
  durable: boolean;
};

export type EpisodeRecord = {
  id: string;
  productionId: string;
  title: string;
  episodeNumber: number;
  durationSec: 15 | 30 | 45 | 60;
  premise: string;
  classification: 'PREVIEW_NONCANONICAL';
  currentStage: string;
  completedStages: string[];
};

export type AssetRecord = {
  id: string;
  productionId: string;
  name: string;
  type: string;
  version: string;
  status: 'REGISTERED_METADATA_ONLY';
  classification: 'PREVIEW_NONCANONICAL';
  canonical: false;
  objectKey: null;
  notes: string;
};

export type VoiceConsentRecord = {
  recordedLikeness: false;
  voiceCloningAuthorized: false;
  recordedAt: null;
  notes: string;
};

export type VoiceProfileRecord = {
  id: string;
  productionId: string;
  characterLabel: string;
  displayName: string;
  notes: string;
  providerVoiceId: null;
  auditionAvailable: false;
  consent: VoiceConsentRecord;
};

export type WorkflowStatusRecord = {
  episodeId: string;
  currentStage: string;
  completedStages: string[];
  blockedReason: string | null;
};

export type ReadinessResultRecord = {
  productionId: string;
  productionReady: false;
  itemCount: number;
  evaluatedAt: string;
};

export type RenderRequestRecord = {
  id: string;
  productionId: string;
  episodeId: string;
  label: 'Draft request — not rendered';
  status: 'NOT_RENDERED';
  contactedProvider: false;
  outputFile: null;
  progress: null;
};

export type AuditEventRecord = {
  id: string;
  workspaceId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type PersistenceSnapshot = {
  adapterId: PersistenceAdapterId;
  durable: boolean;
  settings: WorkspaceSettingsRecord | null;
  productions: ProductionRecord[];
  episodes: EpisodeRecord[];
  assets: AssetRecord[];
  voices: VoiceProfileRecord[];
  workflows: WorkflowStatusRecord[];
  readiness: ReadinessResultRecord | null;
  renderRequests: RenderRequestRecord[];
  auditEvents: AuditEventRecord[];
};

export type SafePersistenceSnapshot = {
  mode: StudioRuntimeMode;
  selectedPersistenceMode: PersistenceAdapterId;
  activePersistenceMode: PersistenceAdapterId;
  previewWorkspace: 'available' | 'unavailable';
  browserStorage: 'available';
  previewDatabase: 'not_connected' | 'configured_not_connected';
  productionDatabase: 'not_connected' | 'configured_not_connected';
  durableStorage: 'not_configured' | 'configured_not_connected';
  backupAvailable: true;
  lastSuccessfulSave: 'browser-only' | null;
  providerMode: ProviderMode;
  dataDurability: 'browser-only-non-durable' | 'production-blocked';
  productionActions: 'blocked';
};

export class PersistenceError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export type StudioPersistenceAdapter = {
  readonly id: PersistenceAdapterId;
  readonly durable: boolean;
  readonly connected: boolean;
  assertWritable(): void;
  readSnapshot(): PersistenceSnapshot;
  saveSettings(input: Omit<WorkspaceSettingsRecord, 'durable'>): WorkspaceSettingsRecord;
  saveProduction(input: ProductionRecord): ProductionRecord;
  saveEpisode(input: EpisodeRecord): EpisodeRecord;
  saveAsset(input: AssetRecord): AssetRecord;
  saveVoice(input: VoiceProfileRecord): VoiceProfileRecord;
  saveWorkflow(input: WorkflowStatusRecord): WorkflowStatusRecord;
  saveReadiness(input: ReadinessResultRecord): ReadinessResultRecord;
  saveRenderRequest(input: RenderRequestRecord): RenderRequestRecord;
  writeAudit(event: Omit<AuditEventRecord, 'id' | 'createdAt'>): AuditEventRecord;
};
