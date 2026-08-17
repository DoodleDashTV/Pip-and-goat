import { calculatePreviewReadiness } from '../preview-workspace/readiness';
import { emptyPreviewWorkspace, loadPreviewWorkspace } from '../preview-workspace/store';
import type { PreviewStoreBackend, PreviewWorkspace } from '../preview-workspace/types';
import {
  PersistenceError,
  PREVIEW_ADAPTER_ID,
  type AuditEventRecord,
  type PersistenceSnapshot,
  type StudioPersistenceAdapter,
} from './types';

function id(prefix: string) {
  return `prv_${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function snapshotPreviewWorkspace(workspace: PreviewWorkspace): PersistenceSnapshot {
  const productionId = 'preview-production';
  const workspaceId = 'preview-workspace';
  const readiness = calculatePreviewReadiness(workspace);
  return {
    adapterId: PREVIEW_ADAPTER_ID,
    durable: false,
    settings: workspace.settingsSaved
      ? {
          id: workspaceId,
          projectName: workspace.settings.projectName,
          format: workspace.settings.format,
          fps: workspace.settings.fps,
          paidResourcesAuthorized: false,
          theatricalBindingCompleted: false,
          durable: false,
        }
      : null,
    productions: workspace.settingsSaved
      ? [
          {
            id: productionId,
            workspaceId,
            name: workspace.settings.projectName,
            status: 'PREVIEW',
            durable: false,
          },
        ]
      : [],
    episodes: workspace.episodes.map((episode) => ({
      id: episode.id,
      productionId,
      title: episode.title,
      episodeNumber: episode.episodeNumber,
      durationSec: episode.durationSec,
      premise: episode.premise,
      classification: 'PREVIEW_NONCANONICAL',
      currentStage: episode.currentStage,
      completedStages: episode.completedStages,
    })),
    assets: workspace.assets.map((asset) => ({
      id: asset.id,
      productionId,
      name: asset.name,
      type: asset.type,
      version: asset.version,
      status: 'REGISTERED_METADATA_ONLY',
      classification: 'PREVIEW_NONCANONICAL',
      canonical: false,
      objectKey: null,
      notes: asset.notes,
    })),
    voices: workspace.voices.map((voice) => ({
      id: voice.id,
      productionId,
      characterLabel: voice.characterLabel,
      displayName: voice.displayName,
      notes: voice.notes,
      providerVoiceId: null,
      auditionAvailable: false,
      consent: {
        recordedLikeness: false,
        voiceCloningAuthorized: false,
        recordedAt: null,
        notes: '',
      },
    })),
    workflows: workspace.episodes.map((episode) => ({
      episodeId: episode.id,
      currentStage: episode.currentStage,
      completedStages: episode.completedStages,
      blockedReason: episode.currentStage === 'OUTPUT_GATE' ? 'Draft walk stops at OUTPUT_GATE.' : null,
    })),
    readiness: {
      productionId,
      productionReady: false,
      itemCount: readiness.items.length,
      evaluatedAt: new Date().toISOString(),
    },
    renderRequests: workspace.renderRequests.map((request) => ({
      id: request.id,
      productionId,
      episodeId: request.episodeId,
      label: 'Draft request — not rendered',
      status: 'NOT_RENDERED',
      contactedProvider: false,
      outputFile: null,
      progress: null,
    })),
    auditEvents: [],
  };
}

export function createPreviewPersistenceAdapter(
  backend: PreviewStoreBackend,
): StudioPersistenceAdapter {
  return {
    id: PREVIEW_ADAPTER_ID,
    durable: false,
    assertWritable() {
      return;
    },
    readSnapshot() {
      return snapshotPreviewWorkspace(loadPreviewWorkspace(backend) ?? emptyPreviewWorkspace());
    },
    writeAudit(event) {
      const record: AuditEventRecord = {
        id: id('audit'),
        createdAt: new Date().toISOString(),
        ...event,
      };
      return record;
    },
  };
}

export function assertPreviewAdapterPreservesKey(key: string): void {
  if (key !== 'tivvlejoy.preview-workspace.v1') {
    throw new PersistenceError('Preview storage key must stay tivvlejoy.preview-workspace.v1.', 'PREVIEW_KEY');
  }
}
