import {
  PersistenceError,
  PREVIEW_DATABASE_ADAPTER_ID,
  type AssetRecord,
  type AuditEventRecord,
  type EpisodeRecord,
  type PersistenceSnapshot,
  type ProductionRecord,
  type ReadinessResultRecord,
  type RenderRequestRecord,
  type StudioPersistenceAdapter,
  type VoiceProfileRecord,
  type WorkflowStatusRecord,
  type WorkspaceSettingsRecord,
} from './types';
import {
  assertRecordId,
  assertSchemaVersion,
  assertWorkspaceOwnership,
  fingerprintRecord,
  sanitizeAuditDetail,
  wrapDatabaseError,
} from './validation';
import { TIVVLEJOY_RECORD_SCHEMA_VERSION } from './types';

export type PreviewDatabaseStore = {
  settings: WorkspaceSettingsRecord | null;
  productions: Map<string, ProductionRecord>;
  episodes: Map<string, EpisodeRecord>;
  assets: Map<string, AssetRecord>;
  voices: Map<string, VoiceProfileRecord>;
  workflows: Map<string, WorkflowStatusRecord>;
  readiness: ReadinessResultRecord | null;
  renderRequests: Map<string, RenderRequestRecord>;
  auditEvents: AuditEventRecord[];
  fingerprints: Map<string, string>;
};

export function createMemoryPreviewDatabaseStore(): PreviewDatabaseStore {
  return {
    settings: null,
    productions: new Map(),
    episodes: new Map(),
    assets: new Map(),
    voices: new Map(),
    workflows: new Map(),
    readiness: null,
    renderRequests: new Map(),
    auditEvents: [],
    fingerprints: new Map(),
  };
}

function id(prefix: string) {
  return `prv_${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function upsert<T extends { id?: string }>(
  map: Map<string, T>,
  record: T & { id: string },
  fingerprint: string,
  fingerprints: Map<string, string>,
): T {
  const existing = map.get(record.id);
  const previous = fingerprints.get(record.id);
  if (existing && previous && previous !== fingerprint) {
    throw new PersistenceError('Duplicate write conflicts with a different record.', 'DUPLICATE_CONFLICT');
  }
  if (existing && previous === fingerprint) return existing;
  map.set(record.id, record);
  fingerprints.set(record.id, fingerprint);
  return record;
}

function snapshotFromStore(store: PreviewDatabaseStore): PersistenceSnapshot {
  return {
    adapterId: PREVIEW_DATABASE_ADAPTER_ID,
    durable: false,
    settings: store.settings,
    productions: [...store.productions.values()],
    episodes: [...store.episodes.values()],
    assets: [...store.assets.values()],
    voices: [...store.voices.values()],
    workflows: [...store.workflows.values()],
    readiness: store.readiness,
    renderRequests: [...store.renderRequests.values()],
    auditEvents: store.auditEvents,
  };
}

/**
 * Preview-database adapter. Writes only when an explicit in-process store is
 * provided (tests). This never opens Prisma, never reads DATABASE_URL, and
 * never contacts a remote host.
 */
export function createPreviewDatabaseAdapter(
  store?: PreviewDatabaseStore,
): StudioPersistenceAdapter {
  const connected = Boolean(store);
  const blocked = (): never => {
    throw new PersistenceError(
      'Preview database is not connected. Browser Preview workspace stays selected. This is not a silent localStorage fallback.',
      'PREVIEW_DATABASE_NOT_CONNECTED',
    );
  };

  if (!store) {
    return {
      id: PREVIEW_DATABASE_ADAPTER_ID,
      durable: false,
      connected: false,
      assertWritable: blocked,
      readSnapshot: () => ({
        adapterId: PREVIEW_DATABASE_ADAPTER_ID,
        durable: false,
        settings: null,
        productions: [],
        episodes: [],
        assets: [],
        voices: [],
        workflows: [],
        readiness: null,
        renderRequests: [],
        auditEvents: [],
      }),
      saveSettings: blocked,
      saveProduction: blocked,
      saveEpisode: blocked,
      saveAsset: blocked,
      saveVoice: blocked,
      saveWorkflow: blocked,
      saveReadiness: blocked,
      saveRenderRequest: blocked,
      writeAudit: blocked,
    };
  }

  const workspaceId = () => store.settings?.id ?? 'preview-workspace';

  return {
    id: PREVIEW_DATABASE_ADAPTER_ID,
    durable: false,
    connected: true,
    assertWritable() {
      assertSchemaVersion(TIVVLEJOY_RECORD_SCHEMA_VERSION);
    },
    readSnapshot() {
      return snapshotFromStore(store);
    },
    saveSettings(input) {
      try {
        assertRecordId(input.id, 'workspace id');
        const record: WorkspaceSettingsRecord = { ...input, durable: false };
        store.settings = record;
        return record;
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw wrapDatabaseError(error);
      }
    },
    saveProduction(input) {
      try {
        assertRecordId(input.id, 'production id');
        assertRecordId(input.workspaceId, 'workspace id');
        assertWorkspaceOwnership({
          workspaceId: workspaceId(),
          recordWorkspaceId: input.workspaceId,
        });
        return upsert(
          store.productions,
          { ...input, durable: false },
          fingerprintRecord([input.id, input.name]),
          store.fingerprints,
        );
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw wrapDatabaseError(error);
      }
    },
    saveEpisode(input) {
      try {
        assertRecordId(input.id, 'episode id');
        assertRecordId(input.productionId, 'production id');
        if (!store.productions.has(input.productionId)) {
          throw new PersistenceError('Episode production is outside this workspace ownership boundary.', 'WORKSPACE_OWNERSHIP');
        }
        return upsert(
          store.episodes,
          { ...input, classification: 'PREVIEW_NONCANONICAL' },
          fingerprintRecord([input.id, input.title, input.episodeNumber, input.premise]),
          store.fingerprints,
        );
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw wrapDatabaseError(error);
      }
    },
    saveAsset(input) {
      try {
        assertRecordId(input.id, 'asset id');
        if (!store.productions.has(input.productionId)) {
          throw new PersistenceError('Asset production is outside this workspace ownership boundary.', 'WORKSPACE_OWNERSHIP');
        }
        return upsert(
          store.assets,
          { ...input, canonical: false, objectKey: null, status: 'REGISTERED_METADATA_ONLY' },
          fingerprintRecord([input.id, input.name, input.version]),
          store.fingerprints,
        );
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw wrapDatabaseError(error);
      }
    },
    saveVoice(input) {
      try {
        assertRecordId(input.id, 'voice id');
        if (!store.productions.has(input.productionId)) {
          throw new PersistenceError('Voice production is outside this workspace ownership boundary.', 'WORKSPACE_OWNERSHIP');
        }
        return upsert(
          store.voices,
          {
            ...input,
            providerVoiceId: null,
            auditionAvailable: false,
            consent: {
              recordedLikeness: false,
              voiceCloningAuthorized: false,
              recordedAt: null,
              notes: input.consent?.notes ?? '',
            },
          },
          fingerprintRecord([input.id, input.characterLabel, input.displayName]),
          store.fingerprints,
        );
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw wrapDatabaseError(error);
      }
    },
    saveWorkflow(input) {
      try {
        assertRecordId(input.episodeId, 'episode id');
        if (!store.episodes.has(input.episodeId)) {
          throw new PersistenceError('Workflow episode is outside this workspace ownership boundary.', 'WORKSPACE_OWNERSHIP');
        }
        store.workflows.set(input.episodeId, input);
        return input;
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw wrapDatabaseError(error);
      }
    },
    saveReadiness(input) {
      try {
        if (!store.productions.has(input.productionId)) {
          throw new PersistenceError('Readiness production is outside this workspace ownership boundary.', 'WORKSPACE_OWNERSHIP');
        }
        const record: ReadinessResultRecord = { ...input, productionReady: false };
        store.readiness = record;
        return record;
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw wrapDatabaseError(error);
      }
    },
    saveRenderRequest(input) {
      try {
        assertRecordId(input.id, 'render id');
        if (!store.productions.has(input.productionId) || !store.episodes.has(input.episodeId)) {
          throw new PersistenceError('Render request is outside this workspace ownership boundary.', 'WORKSPACE_OWNERSHIP');
        }
        return upsert(
          store.renderRequests,
          {
            ...input,
            label: 'Draft request — not rendered',
            status: 'NOT_RENDERED',
            contactedProvider: false,
            outputFile: null,
            progress: null,
          },
          fingerprintRecord([input.id, input.episodeId]),
          store.fingerprints,
        );
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw wrapDatabaseError(error);
      }
    },
    writeAudit(event) {
      try {
        const record: AuditEventRecord = {
          id: id('audit'),
          createdAt: new Date().toISOString(),
          ...event,
          detail: sanitizeAuditDetail(event.detail),
        };
        store.auditEvents.push(record);
        return record;
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw wrapDatabaseError(error);
      }
    },
  };
}
