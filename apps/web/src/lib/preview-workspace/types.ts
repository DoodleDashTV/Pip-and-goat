export const PREVIEW_WORKSPACE_KIND = 'PREVIEW_WORKSPACE' as const;
export const PREVIEW_STORAGE_KEY = 'tivvlejoy.preview-workspace.v1';
export const PREVIEW_CLASSIFICATION = 'PREVIEW_NONCANONICAL' as const;
export const PREVIEW_PUBLIC_BANNER =
  'PREVIEW — Work is stored only in this browser. It is not a production render.';
export const FOUNDATION_STAGE_LABEL = 'Foundation Stage';


export const PREVIEW_DRAFT_STAGES = [
  'BRIEF',
  'STORY',
  'CONTINUITY',
  'STORYBOARD',
  'ANIMATIC',
  'SHOTS',
  'LIBRARY',
  'AUDIO',
  'ORCHESTRATION',
  'QC',
  'OUTPUT_GATE',
] as const;

export type PreviewDraftStage = (typeof PREVIEW_DRAFT_STAGES)[number];

export const FORBIDDEN_PREVIEW_STAGES = ['FINAL_RENDER', 'THEATRICAL', 'PUBLISHING'] as const;

export type PreviewSettings = {
  projectName: string;
  format: '1080x1920';
  fps: 30;
  paidResourcesAuthorized: false;
  theatricalBindingCompleted: false;
};

export type PreviewEpisode = {
  id: string;
  title: string;
  episodeNumber: number;
  durationSec: 15 | 30 | 45 | 60;
  premise: string;
  classification: typeof PREVIEW_CLASSIFICATION;
  createdAt: string;
  currentStage: PreviewDraftStage;
  completedStages: PreviewDraftStage[];
  submitFingerprint: string;
};

export type PreviewAsset = {
  id: string;
  name: string;
  type: 'CHARACTER' | 'PROP' | 'ENVIRONMENT' | 'OTHER';
  version: string;
  status: 'REGISTERED_METADATA_ONLY';
  classification: typeof PREVIEW_CLASSIFICATION;
  canonical: false;
  notes: string;
  createdAt: string;
};

export type PreviewVoiceProfile = {
  id: string;
  characterLabel: string;
  displayName: string;
  notes: string;
  providerVoiceId: null;
  auditionAvailable: false;
  savedAt: string;
};

export type PreviewRenderRequest = {
  id: string;
  episodeId: string;
  label: 'Draft request — not rendered';
  status: 'NOT_RENDERED';
  contactedProvider: false;
  outputFile: null;
  progress: null;
  createdAt: string;
};

export type PreviewWorkspace = {
  kind: typeof PREVIEW_WORKSPACE_KIND;
  durable: false;
  label: 'Preview workspace — this browser only';
  settings: PreviewSettings;
  settingsSaved: boolean;
  episodes: PreviewEpisode[];
  assets: PreviewAsset[];
  voices: PreviewVoiceProfile[];
  renderRequests: PreviewRenderRequest[];
  lastResetAt: string | null;
};

export type PreviewReadinessItem = {
  id: string;
  label: string;
  state: 'READY' | 'MISSING' | 'CLOSED';
  href: string;
  detail: string;
};

export type PreviewStoreBackend = {
  read(): string | null;
  write(value: string): void;
  clear(): void;
};
