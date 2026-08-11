import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma as defaultPrisma } from '@doodle-dash/database';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

export const RenderStatusSchema = z.enum([
  'QUEUED',
  'PREPARING',
  'RENDERING',
  'ENCODING',
  'QUALITY_CHECK',
  'COMPLETE',
  'FAILED',
  'CANCELLED',
]);
export type RenderStatus = z.infer<typeof RenderStatusSchema>;

export const RenderResolutionSchema = z.enum(['270x480', '360x640', '540x960', '1080x1920']);
export type RenderResolution = z.infer<typeof RenderResolutionSchema>;

export const RenderFpsSchema = z.union([z.literal(24), z.literal(30), z.literal(60)]);
export type RenderFps = z.infer<typeof RenderFpsSchema>;

export const RenderEngineSchema = z.enum(['EEVEE', 'CYCLES']);
export type RenderEngine = z.infer<typeof RenderEngineSchema>;

export const DraftRenderResolutionSchema = z.enum(['270x480', '360x640', '540x960']);
export const FinalRenderResolutionSchema = z.literal('1080x1920');

export const RENDER_STATUSES: RenderStatus[] = RenderStatusSchema.options;
export const RENDER_RESOLUTIONS: RenderResolution[] = RenderResolutionSchema.options;
export const RENDER_FPS_VALUES: RenderFps[] = [24, 30, 60];
export const RENDER_ENGINES: RenderEngine[] = RenderEngineSchema.options;

export type RenderAssetRef = {
  id?: string;
  role: 'character' | 'location' | 'prop' | 'audio' | 'texture' | 'script' | 'other';
  uri: string;
  checksum?: string;
};

export const RenderJobPayloadSchema = z.object({
  universeId: z.string().uuid().optional(),
  episodeId: z.string().uuid().optional(),
  sceneId: z.string().min(1),
  shotId: z.string().min(1).optional(),
  blenderSceneUri: z.string().min(1).optional(),
  scriptUri: z.string().min(1).optional(),
  assets: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(['character', 'location', 'prop', 'audio', 'texture', 'script', 'other']),
        uri: z.string().min(1),
        checksum: z.string().optional(),
      }),
    )
    .default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type RenderJobPayload = z.infer<typeof RenderJobPayloadSchema>;

export const CreateRenderJobSchema = z.object({
  priority: z.number().int().min(0).max(100).default(50),
  resolution: RenderResolutionSchema,
  fps: RenderFpsSchema,
  engine: RenderEngineSchema,
  payload: RenderJobPayloadSchema,
});
export type CreateRenderJobInput = z.input<typeof CreateRenderJobSchema>;
export type NormalizedCreateRenderJobInput = z.output<typeof CreateRenderJobSchema>;

export type RenderJobRecord = {
  id: string;
  status: RenderStatus;
  priority: number;
  resolution: RenderResolution;
  fps: RenderFps;
  engine: RenderEngine;
  payload: RenderJobPayload;
  progress?: number | null;
  error?: string | null;
  workerId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
};

export type RenderAttemptRecord = {
  id: string;
  renderJobId: string;
  workerId: string;
  status: RenderStatus;
  startedAt?: Date | string;
  finishedAt?: Date | string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RenderOutputRecord = {
  id: string;
  renderJobId: string;
  kind: 'frames' | 'preview' | 'final' | 'thumbnail' | 'logs' | 'metadata';
  uri: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type RenderWorkerRecord = {
  id: string;
  name: string;
  status: 'IDLE' | 'BUSY' | 'OFFLINE';
  capabilities: RenderWorkerCapabilities;
  lastHeartbeatAt?: Date | string | null;
};

export type RenderProgress = {
  status?: RenderStatus;
  progress: number;
  message?: string;
  frame?: number;
  totalFrames?: number;
  metadata?: Record<string, unknown>;
};

export type RenderWorkerCapabilities = {
  engines: RenderEngine[];
  resolutions: RenderResolution[];
  fps: RenderFps[];
  maxConcurrentJobs?: number;
  supportsGpu?: boolean;
};

export interface RenderWorker {
  id: string;
  name: string;
  capabilities: RenderWorkerCapabilities;
  prepare(job: RenderJobRecord): Promise<void>;
  render(job: RenderJobRecord, reportProgress: (progress: RenderProgress) => Promise<void>): Promise<RenderOutputRecord[]>;
  cancel(jobId: string): Promise<void>;
  heartbeat(): Promise<RenderWorkerRecord>;
}

export type QueuedRenderJob = {
  queueId: string;
  job: NormalizedCreateRenderJobInput;
  enqueuedAt: string;
  attempts: number;
  lockedBy?: string;
  lockedAt?: string;
};

export interface RenderQueue {
  enqueue(job: CreateRenderJobInput): Promise<QueuedRenderJob>;
  claim(workerId: string): Promise<QueuedRenderJob | null>;
  complete(queueId: string): Promise<void>;
  fail(queueId: string, reason: string): Promise<void>;
  list(): Promise<QueuedRenderJob[]>;
}

export class InMemoryRenderQueue implements RenderQueue {
  private jobs = new Map<string, QueuedRenderJob>();

  async enqueue(job: CreateRenderJobInput): Promise<QueuedRenderJob> {
    const queued: QueuedRenderJob = {
      queueId: cryptoRandomId(),
      job: CreateRenderJobSchema.parse(job),
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    };
    this.jobs.set(queued.queueId, queued);
    return queued;
  }

  async claim(workerId: string): Promise<QueuedRenderJob | null> {
    const next = [...this.jobs.values()]
      .filter((job) => !job.lockedBy)
      .sort((a, b) => b.job.priority - a.job.priority || a.enqueuedAt.localeCompare(b.enqueuedAt))[0];
    if (!next) return null;
    next.lockedBy = workerId;
    next.lockedAt = new Date().toISOString();
    next.attempts += 1;
    this.jobs.set(next.queueId, next);
    return next;
  }

  async complete(queueId: string): Promise<void> {
    this.jobs.delete(queueId);
  }

  async fail(queueId: string, reason: string): Promise<void> {
    const job = this.jobs.get(queueId);
    if (!job) return;
    this.jobs.set(queueId, { ...job, lockedBy: undefined, lockedAt: undefined, job: { ...job.job, payload: { ...job.job.payload, metadata: { ...job.job.payload.metadata, lastQueueError: reason } } } });
  }

  async list(): Promise<QueuedRenderJob[]> {
    return [...this.jobs.values()];
  }
}

export class FileRenderQueue implements RenderQueue {
  constructor(private readonly filePath: string) {}

  async enqueue(job: CreateRenderJobInput): Promise<QueuedRenderJob> {
    const queued: QueuedRenderJob = {
      queueId: cryptoRandomId(),
      job: CreateRenderJobSchema.parse(job),
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    };
    await this.write([...(await this.read()), queued]);
    return queued;
  }

  async claim(workerId: string): Promise<QueuedRenderJob | null> {
    const jobs = await this.read();
    const next = jobs
      .filter((job) => !job.lockedBy)
      .sort((a, b) => b.job.priority - a.job.priority || a.enqueuedAt.localeCompare(b.enqueuedAt))[0];
    if (!next) return null;
    const updated = jobs.map((job) =>
      job.queueId === next.queueId
        ? { ...job, lockedBy: workerId, lockedAt: new Date().toISOString(), attempts: job.attempts + 1 }
        : job,
    );
    await this.write(updated);
    return updated.find((job) => job.queueId === next.queueId) ?? null;
  }

  async complete(queueId: string): Promise<void> {
    await this.write((await this.read()).filter((job) => job.queueId !== queueId));
  }

  async fail(queueId: string, reason: string): Promise<void> {
    const jobs = await this.read();
    await this.write(
      jobs.map((job) =>
        job.queueId === queueId
          ? {
              ...job,
              lockedBy: undefined,
              lockedAt: undefined,
              job: {
                ...job.job,
                payload: {
                  ...job.job.payload,
                  metadata: { ...job.job.payload.metadata, lastQueueError: reason },
                },
              },
            }
          : job,
      ),
    );
  }

  async list(): Promise<QueuedRenderJob[]> {
    return this.read();
  }

  private async read(): Promise<QueuedRenderJob[]> {
    try {
      const text = await fs.readFile(this.filePath, 'utf8');
      const data = JSON.parse(text) as unknown;
      return z.array(QueuedRenderJobSchema).parse(data);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async write(jobs: QueuedRenderJob[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(jobs, null, 2));
    await fs.rename(tmp, this.filePath);
  }
}

const QueuedRenderJobSchema = z.object({
  queueId: z.string(),
  job: CreateRenderJobSchema,
  enqueuedAt: z.string(),
  attempts: z.number().int().min(0),
  lockedBy: z.string().optional(),
  lockedAt: z.string().optional(),
});

type PrismaDelegate<TRecord> = {
  create(args: { data: Record<string, unknown> }): Promise<TRecord>;
  findUnique(args: { where: { id: string }; include?: Record<string, unknown> }): Promise<TRecord | null>;
  findMany(args?: Record<string, unknown>): Promise<TRecord[]>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<TRecord>;
  delete(args: { where: { id: string } }): Promise<TRecord>;
};

type RenderPrismaClient = {
  renderJob: PrismaDelegate<RenderJobRecord> & {
    updateMany?(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  renderAttempt: PrismaDelegate<RenderAttemptRecord>;
  renderOutput: PrismaDelegate<RenderOutputRecord>;
  renderWorker: PrismaDelegate<RenderWorkerRecord> & {
    upsert(args: {
      where: { id: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }): Promise<RenderWorkerRecord>;
  };
  $transaction?<T>(actions: Promise<T>[]): Promise<T[]>;
};

export class RenderJobService {
  constructor(private readonly db: RenderPrismaClient = defaultPrisma as unknown as RenderPrismaClient) {}

  async create(input: CreateRenderJobInput): Promise<RenderJobRecord> {
    const data = CreateRenderJobSchema.parse(input);
    return this.renderJob().create({
      data: {
        ...data,
        status: 'QUEUED',
        progress: 0,
      },
    });
  }

  async get(id: string): Promise<RenderJobRecord> {
    const job = await this.renderJob().findUnique({
      where: { id },
      include: { attempts: true, outputs: true, worker: true },
    });
    if (!job) {
      throw new AppError('Render job not found.', 'RENDER_JOB_NOT_FOUND', 404);
    }
    return job;
  }

  async list(filters: { status?: RenderStatus; workerId?: string; take?: number } = {}): Promise<RenderJobRecord[]> {
    return this.renderJob().findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.workerId ? { workerId: filters.workerId } : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: filters.take,
    });
  }

  async updateStatus(id: string, status: RenderStatus, options: { progress?: number; error?: string | null } = {}): Promise<RenderJobRecord> {
    RenderStatusSchema.parse(status);
    return this.renderJob().update({
      where: { id },
      data: {
        status,
        ...(typeof options.progress === 'number' ? { progress: clampProgress(options.progress) } : {}),
        ...(options.error !== undefined ? { error: options.error } : {}),
        ...(status === 'COMPLETE' || status === 'FAILED' || status === 'CANCELLED'
          ? { completedAt: new Date() }
          : {}),
      },
    });
  }

  async cancel(id: string): Promise<RenderJobRecord> {
    return this.updateStatus(id, 'CANCELLED');
  }

  async delete(id: string): Promise<RenderJobRecord> {
    return this.renderJob().delete({ where: { id } });
  }

  async claimNext(workerId: string): Promise<RenderJobRecord | null> {
    const [job] = await this.renderJob().findMany({
      where: { status: 'QUEUED' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 1,
    });
    if (!job) return null;
    return this.renderJob().update({
      where: { id: job.id },
      data: {
        status: 'PREPARING',
        workerId,
        progress: 0,
        startedAt: new Date(),
      },
    });
  }

  async recordAttempt(input: {
    renderJobId: string;
    workerId: string;
    status?: RenderStatus;
    metadata?: Record<string, unknown>;
  }): Promise<RenderAttemptRecord> {
    return this.renderAttempt().create({
      data: {
        renderJobId: input.renderJobId,
        workerId: input.workerId,
        status: input.status ?? 'PREPARING',
        metadata: input.metadata ?? {},
      },
    });
  }

  async finishAttempt(id: string, status: RenderStatus, error?: string): Promise<RenderAttemptRecord> {
    return this.renderAttempt().update({
      where: { id },
      data: { status, error: error ?? null, finishedAt: new Date() },
    });
  }

  async addOutput(input: Omit<RenderOutputRecord, 'id'>): Promise<RenderOutputRecord> {
    return this.renderOutput().create({ data: input });
  }

  async registerWorker(worker: Omit<RenderWorkerRecord, 'status' | 'lastHeartbeatAt'> & { status?: RenderWorkerRecord['status'] }): Promise<RenderWorkerRecord> {
    return this.renderWorker().upsert({
      where: { id: worker.id },
      update: {
        name: worker.name,
        status: worker.status ?? 'IDLE',
        capabilities: worker.capabilities,
        lastHeartbeatAt: new Date(),
      },
      create: {
        ...worker,
        status: worker.status ?? 'IDLE',
        lastHeartbeatAt: new Date(),
      },
    });
  }

  async heartbeat(workerId: string, status: RenderWorkerRecord['status'] = 'IDLE'): Promise<RenderWorkerRecord> {
    return this.renderWorker().update({
      where: { id: workerId },
      data: { status, lastHeartbeatAt: new Date() },
    });
  }

  private renderJob() {
    if (!this.db.renderJob) missingModel('renderJob');
    return this.db.renderJob;
  }

  private renderAttempt() {
    if (!this.db.renderAttempt) missingModel('renderAttempt');
    return this.db.renderAttempt;
  }

  private renderOutput() {
    if (!this.db.renderOutput) missingModel('renderOutput');
    return this.db.renderOutput;
  }

  private renderWorker() {
    if (!this.db.renderWorker) missingModel('renderWorker');
    return this.db.renderWorker;
  }
}

function missingModel(model: string): never {
  throw new AppError(`Prisma model ${model} is not available. Apply the render_jobs schema before using RenderJobService.`, 'RENDER_PRISMA_MODEL_MISSING', 501);
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function cryptoRandomId(): string {
  return `rq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const renderJobService = new RenderJobService();
