import { assertAudienceFacingContent } from '../brand-canon';
import { isPublicWebsitePreview } from '../public-preview';
import {
  emptyPreviewWorkspace,
  loadPreviewWorkspace,
  resetPreviewWorkspace,
  savePreviewWorkspace,
} from './store';
import {
  FORBIDDEN_PREVIEW_STAGES,
  PREVIEW_CLASSIFICATION,
  PREVIEW_DRAFT_STAGES,
  type PreviewAsset,
  type PreviewDraftStage,
  type PreviewEpisode,
  type PreviewRenderRequest,
  type PreviewSettings,
  type PreviewStoreBackend,
  type PreviewVoiceProfile,
  type PreviewWorkspace,
} from './types';

export class PreviewWorkspaceError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'PreviewWorkspaceError';
  }
}

export function assertProductionPersistenceAvailable(
  env: Partial<Record<string, string | undefined>> = process.env,
): void {
  if (isPublicWebsitePreview(env)) {
    throw new PreviewWorkspaceError(
      'Production persistence is unavailable. Preview workspace is a separate adapter and is not a silent fallback.',
      'PRODUCTION_PERSISTENCE_UNAVAILABLE',
    );
  }
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `prv_${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function fingerprint(title: string, episodeNumber: number, premise: string) {
  return `${title.trim().toLowerCase()}|${episodeNumber}|${premise.trim().toLowerCase()}`;
}

export function savePreviewSettings(
  input: { projectName: string },
  backend: PreviewStoreBackend,
): PreviewWorkspace {
  const workspace = loadPreviewWorkspace(backend);
  const projectName = input.projectName.trim();
  if (!projectName) {
    throw new PreviewWorkspaceError('Project name is required.', 'SETTINGS_INVALID');
  }
  assertAudienceFacingContent(
    { title: projectName },
    (message, code) => new PreviewWorkspaceError(message, code),
  );
  const settings: PreviewSettings = {
    projectName,
    format: '1080x1920',
    fps: 30,
    paidResourcesAuthorized: false,
    theatricalBindingCompleted: false,
  };
  return savePreviewWorkspace({ ...workspace, settings, settingsSaved: true }, backend);
}

export function createPreviewEpisode(
  input: { title: string; episodeNumber: number; durationSec: number; premise: string },
  backend: PreviewStoreBackend,
): { workspace: PreviewWorkspace; episode: PreviewEpisode } {
  const workspace = loadPreviewWorkspace(backend);
  const title = input.title.trim();
  const premise = input.premise.trim();
  const episodeNumber = Number(input.episodeNumber);
  const durationSec = Number(input.durationSec);
  if (!title) throw new PreviewWorkspaceError('Title is required.', 'EPISODE_INVALID');
  if (!premise) throw new PreviewWorkspaceError('Premise is required.', 'EPISODE_INVALID');
  const refuseLegacy = (message: string, code: string) => new PreviewWorkspaceError(message, code);
  assertAudienceFacingContent({ title, description: premise }, refuseLegacy);
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
    throw new PreviewWorkspaceError('Episode number must be a positive integer.', 'EPISODE_INVALID');
  }
  if (![15, 30, 45, 60].includes(durationSec)) {
    throw new PreviewWorkspaceError('Duration must be 15, 30, 45, or 60 seconds.', 'EPISODE_INVALID');
  }
  const submitFingerprint = fingerprint(title, episodeNumber, premise);
  if (workspace.episodes.some((episode) => episode.submitFingerprint === submitFingerprint)) {
    throw new PreviewWorkspaceError(
      'That Preview episode was already created. Open it from Episode Workflow.',
      'EPISODE_DUPLICATE',
    );
  }
  if (workspace.episodes.some((episode) => episode.episodeNumber === episodeNumber)) {
    throw new PreviewWorkspaceError(
      `Episode ${episodeNumber} already exists in this Preview workspace.`,
      'EPISODE_DUPLICATE',
    );
  }
  const episode: PreviewEpisode = {
    id: id('ep'),
    title,
    episodeNumber,
    durationSec: durationSec as 15 | 30 | 45 | 60,
    premise,
    classification: PREVIEW_CLASSIFICATION,
    createdAt: nowIso(),
    currentStage: 'BRIEF',
    completedStages: ['BRIEF'],
    submitFingerprint,
  };
  const next = savePreviewWorkspace({ ...workspace, episodes: [episode, ...workspace.episodes] }, backend);
  return { workspace: next, episode };
}

export function registerPreviewAsset(
  input: { name: string; type: PreviewAsset['type']; version: string; notes?: string },
  backend: PreviewStoreBackend,
): { workspace: PreviewWorkspace; asset: PreviewAsset } {
  const workspace = loadPreviewWorkspace(backend);
  const name = input.name.trim();
  const version = input.version.trim() || 'v1';
  if (!name) throw new PreviewWorkspaceError('Asset name is required.', 'ASSET_INVALID');
  const asset: PreviewAsset = {
    id: id('asset'),
    name,
    type: input.type,
    version,
    status: 'REGISTERED_METADATA_ONLY',
    classification: PREVIEW_CLASSIFICATION,
    canonical: false,
    notes: (input.notes ?? '').trim(),
    createdAt: nowIso(),
  };
  const next = savePreviewWorkspace({ ...workspace, assets: [asset, ...workspace.assets] }, backend);
  return { workspace: next, asset };
}

export function savePreviewVoiceProfile(
  input: { characterLabel: string; displayName: string; notes?: string },
  backend: PreviewStoreBackend,
): { workspace: PreviewWorkspace; voice: PreviewVoiceProfile } {
  const workspace = loadPreviewWorkspace(backend);
  const characterLabel = input.characterLabel.trim();
  const displayName = input.displayName.trim();
  if (!characterLabel) throw new PreviewWorkspaceError('Character label is required.', 'VOICE_INVALID');
  if (!displayName) throw new PreviewWorkspaceError('Voice display name is required.', 'VOICE_INVALID');
  const voice: PreviewVoiceProfile = {
    id: id('voice'),
    characterLabel,
    displayName,
    notes: (input.notes ?? '').trim(),
    providerVoiceId: null,
    auditionAvailable: false,
    savedAt: nowIso(),
  };
  const next = savePreviewWorkspace({ ...workspace, voices: [voice, ...workspace.voices] }, backend);
  return { workspace: next, voice };
}

export function previewStageRequirements(stage: PreviewDraftStage): Array<'episode' | 'asset' | 'voice'> {
  if (stage === 'LIBRARY') return ['episode', 'asset'];
  if (stage === 'AUDIO') return ['episode', 'voice'];
  if (stage === 'ORCHESTRATION' || stage === 'QC' || stage === 'OUTPUT_GATE') {
    return ['episode', 'asset', 'voice'];
  }
  return ['episode'];
}

export function canAdvancePreviewStage(
  workspace: PreviewWorkspace,
  episode: PreviewEpisode,
): { allowed: boolean; reason: string; nextStage: PreviewDraftStage | null } {
  const index = PREVIEW_DRAFT_STAGES.indexOf(episode.currentStage);
  const nextStage = PREVIEW_DRAFT_STAGES[index + 1] ?? null;
  if (!nextStage) {
    return {
      allowed: false,
      reason: 'Draft walk stops at OUTPUT_GATE. Final render, theatrical, and publishing stay closed.',
      nextStage: null,
    };
  }
  if ((FORBIDDEN_PREVIEW_STAGES as readonly string[]).includes(nextStage)) {
    return { allowed: false, reason: 'Forbidden production stage.', nextStage: null };
  }
  const missing = previewStageRequirements(nextStage).filter((need) => {
    if (need === 'episode') return workspace.episodes.length === 0;
    if (need === 'asset') return workspace.assets.length === 0;
    return workspace.voices.length === 0;
  });
  if (missing.length) {
    return {
      allowed: false,
      reason: `Cannot enter ${nextStage} until Preview ${missing.join(', ')} is saved.`,
      nextStage,
    };
  }
  return { allowed: true, reason: `Advance draft stage to ${nextStage}.`, nextStage };
}

export function advancePreviewEpisode(
  episodeId: string,
  backend: PreviewStoreBackend,
): { workspace: PreviewWorkspace; episode: PreviewEpisode } {
  const workspace = loadPreviewWorkspace(backend);
  const episode = workspace.episodes.find((item) => item.id === episodeId);
  if (!episode) throw new PreviewWorkspaceError('Preview episode not found.', 'EPISODE_MISSING');
  const decision = canAdvancePreviewStage(workspace, episode);
  if (!decision.allowed || !decision.nextStage) {
    throw new PreviewWorkspaceError(decision.reason, 'WORKFLOW_BLOCKED');
  }
  const updated: PreviewEpisode = {
    ...episode,
    currentStage: decision.nextStage,
    completedStages: episode.completedStages.includes(decision.nextStage)
      ? episode.completedStages
      : [...episode.completedStages, decision.nextStage],
  };
  const next = savePreviewWorkspace(
    {
      ...workspace,
      episodes: workspace.episodes.map((item) => (item.id === episodeId ? updated : item)),
    },
    backend,
  );
  return { workspace: next, episode: updated };
}

export function createPreviewRenderRequest(
  episodeId: string,
  backend: PreviewStoreBackend,
): { workspace: PreviewWorkspace; request: PreviewRenderRequest } {
  const workspace = loadPreviewWorkspace(backend);
  const episode = workspace.episodes.find((item) => item.id === episodeId);
  if (!episode) throw new PreviewWorkspaceError('Create a Preview episode first.', 'EPISODE_MISSING');
  const request: PreviewRenderRequest = {
    id: id('render'),
    episodeId,
    label: 'Draft request — not rendered',
    status: 'NOT_RENDERED',
    contactedProvider: false,
    outputFile: null,
    progress: null,
    createdAt: nowIso(),
  };
  const next = savePreviewWorkspace(
    { ...workspace, renderRequests: [request, ...workspace.renderRequests] },
    backend,
  );
  return { workspace: next, request };
}

export function resetPreviewStudio(backend: PreviewStoreBackend): PreviewWorkspace {
  return resetPreviewWorkspace(backend);
}

export function readPreviewStudio(backend: PreviewStoreBackend): PreviewWorkspace {
  return loadPreviewWorkspace(backend) ?? emptyPreviewWorkspace();
}
