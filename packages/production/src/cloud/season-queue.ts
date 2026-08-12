/**
 * Season production queue foundation (Phase 19) + batch session (Phase 18).
 * Infrastructure only — does NOT create 60 episodes.
 */
import { z } from 'zod';

export const SeasonQueueEntrySchema = z.object({
  seasonId: z.string().min(1),
  episodeId: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  priority: z.number().int().min(0).max(100).default(50),
  draftApproved: z.boolean().default(false),
  finalApproved: z.boolean().default(false),
  renderStatus: z
    .enum(['PENDING', 'QUEUED', 'RENDERING', 'COMPLETE', 'FAILED', 'SKIPPED'])
    .default('PENDING'),
  qcStatus: z.enum(['PENDING', 'PASS', 'FAIL', 'SKIPPED']).default('PENDING'),
  cloudCost: z.number().nonnegative().nullable().default(null),
  finalOutput: z.string().nullable().default(null),
});
export type SeasonQueueEntry = z.infer<typeof SeasonQueueEntrySchema>;

export type BatchProductionSession = {
  sessionId: string;
  seasonId?: string | null;
  episodeIds: string[];
  provider: 'RUNPOD_BLENDER' | 'LOCAL_BLENDER';
  status: 'PLANNED' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'SHUTDOWN';
  sharedAssetsLoaded: boolean;
  gpuStarted: boolean;
  gpuTerminated: boolean;
  completedEpisodeIds: string[];
  failedEpisodeIds: string[];
  log: Array<{ at: string; event: string; detail?: string }>;
};

/** In-memory season queue foundation (persisted via Prisma model when migrated). */
export class SeasonProductionQueue {
  private entries = new Map<string, SeasonQueueEntry>();

  upsert(entry: SeasonQueueEntry): SeasonQueueEntry {
    const parsed = SeasonQueueEntrySchema.parse(entry);
    const key = `${parsed.seasonId}:${parsed.episodeNumber}`;
    this.entries.set(key, parsed);
    return parsed;
  }

  list(seasonId: string): SeasonQueueEntry[] {
    return [...this.entries.values()]
      .filter((e) => e.seasonId === seasonId)
      .sort((a, b) => a.episodeNumber - b.episodeNumber || b.priority - a.priority);
  }

  readyForFinal(seasonId: string): SeasonQueueEntry[] {
    return this.list(seasonId).filter((e) => e.finalApproved && e.renderStatus !== 'COMPLETE');
  }
}

export class BatchProductionOrchestrator {
  createSession(input: {
    episodeIds: string[];
    seasonId?: string | null;
    provider?: 'RUNPOD_BLENDER' | 'LOCAL_BLENDER';
  }): BatchProductionSession {
    if (input.episodeIds.length === 0) {
      throw new Error('Batch session requires at least one episode.');
    }
    return {
      sessionId: `batch-${Date.now()}`,
      seasonId: input.seasonId ?? null,
      episodeIds: [...input.episodeIds],
      provider: input.provider ?? 'RUNPOD_BLENDER',
      status: 'PLANNED',
      sharedAssetsLoaded: false,
      gpuStarted: false,
      gpuTerminated: false,
      completedEpisodeIds: [],
      failedEpisodeIds: [],
      log: [{ at: new Date().toISOString(), event: 'session_created', detail: `${input.episodeIds.length} episodes` }],
    };
  }

  /** Plan: one GPU, load shared assets once, render EP01..EPn, upload, shutdown. */
  plan(session: BatchProductionSession): string[] {
    return [
      'start_one_gpu',
      'load_shared_production_assets',
      ...session.episodeIds.map((id) => `render_episode:${id}`),
      'upload_all',
      'shutdown_gpu',
    ];
  }

  markSharedAssetsLoaded(session: BatchProductionSession): BatchProductionSession {
    return {
      ...session,
      sharedAssetsLoaded: true,
      status: 'RUNNING',
      log: [...session.log, { at: new Date().toISOString(), event: 'shared_assets_loaded' }],
    };
  }

  markEpisodeComplete(session: BatchProductionSession, episodeId: string): BatchProductionSession {
    return {
      ...session,
      completedEpisodeIds: [...session.completedEpisodeIds, episodeId],
      log: [...session.log, { at: new Date().toISOString(), event: 'episode_complete', detail: episodeId }],
    };
  }

  markShutdown(session: BatchProductionSession): BatchProductionSession {
    return {
      ...session,
      status: 'SHUTDOWN',
      gpuTerminated: true,
      log: [...session.log, { at: new Date().toISOString(), event: 'gpu_shutdown' }],
    };
  }
}

export const seasonProductionQueue = new SeasonProductionQueue();
export const batchProductionOrchestrator = new BatchProductionOrchestrator();
