import { prisma } from '@doodle-dash/database';
import {
  AssetRequestStatusSchema,
  DEFAULT_PRODUCTION_MODE,
  DOODLE_GUARDIAN_THRESHOLD,
  FOUNDING_CODES,
  ProductionModeSchema,
  ProductionModes,
  PublishingStatusSchema,
  RenderJobStatusSchema,
  RenderModeSchema,
  RenderModes,
  VISUAL_QC_THRESHOLD,
  type AssetRequestStatus,
  type ProductionMode as DomainProductionMode,
  type PublishingStatus,
  type RenderJobStatus,
  type RenderMode as DomainRenderMode,
} from '@doodle-dash/domain';
import { characterPreflightService } from '@doodle-dash/characters';
import { canonService } from '@doodle-dash/universe';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

type JsonRecord = Record<string, unknown>;
type PrismaDelegate = {
  findMany(args?: JsonRecord): Promise<unknown[]>;
  findUnique(args: JsonRecord): Promise<unknown | null>;
  findFirst(args?: JsonRecord): Promise<unknown | null>;
  create(args: JsonRecord): Promise<unknown>;
  update(args: JsonRecord): Promise<unknown>;
  updateMany?(args: JsonRecord): Promise<unknown>;
  count?(args?: JsonRecord): Promise<number>;
};

export const ProductionMode = ProductionModes;
export const RenderMode = RenderModes;
export type ProductionMode = DomainProductionMode;
export type RenderMode = DomainRenderMode;
export type { AssetRequestStatus, PublishingStatus, RenderJobStatus };

const db = prisma as unknown as Record<string, PrismaDelegate | undefined>;

function delegate(modelName: string): PrismaDelegate {
  const model = db[modelName];
  if (!model) {
    throw new AppError(
      `Prisma model "${modelName}" is not available. Regenerate @doodle-dash/database after the schema owner lands it.`,
      'PRISMA_MODEL_NOT_GENERATED',
      501,
    );
  }
  return model;
}

function optionalDelegate(modelName: string): PrismaDelegate | null {
  return db[modelName] ?? null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value !== null && value !== undefined);
}

function normalizedIncludes(source: string, target: string) {
  return source.toLowerCase().includes(target.toLowerCase());
}

const UUID = z.string().uuid();
const NonEmptyString = z.string().trim().min(1);
const ScoreSchema = z.number().int().min(0).max(100);

export const ProductionShotSignalSchema = z.object({
  shotId: z.string().optional(),
  description: z.string().trim().default(''),
  durationSeconds: z.number().positive().default(4),
  characterIds: z.array(z.string()).default([]),
  reusableRenderId: z.string().optional(),
  reusableAnimationId: z.string().optional(),
  hasApproved3dAssets: z.boolean().default(false),
  hasLayeredElements: z.boolean().default(false),
  motionIntensity: ScoreSchema.default(50),
  storyImportance: ScoreSchema.default(50),
  visualComplexity: ScoreSchema.default(50),
  isHeroMoment: z.boolean().default(false),
  isDialogueHeavy: z.boolean().default(false),
  requestedMode: ProductionModeSchema.optional(),
});

export const CreateAssetRequestSchema = z.object({
  universeId: UUID.optional(),
  episodeId: UUID.optional(),
  shotId: UUID.optional(),
  entityType: NonEmptyString,
  entityId: z.string().optional(),
  assetType: NonEmptyString,
  title: NonEmptyString,
  description: NonEmptyString,
  priority: ScoreSchema.default(50),
  status: AssetRequestStatusSchema.default('REQUESTED'),
});

export const PublishReleaseSchema = z.object({
  episodeId: UUID,
  title: NonEmptyString,
  targetPlatform: NonEmptyString.default('Doodle Dash TV'),
  status: PublishingStatusSchema.default('DRAFT'),
  scheduledAt: z.date().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type ProductionShotSignal = z.infer<typeof ProductionShotSignalSchema>;
export type CreateAssetRequestInput = z.infer<typeof CreateAssetRequestSchema>;
export type PublishReleaseInput = z.infer<typeof PublishReleaseSchema>;

export type ProductionEstimate = {
  renderMode: RenderMode;
  cinematicImportance: number;
  estimatedCostUnits: number;
  estimatedMinutes: number;
  rationale: string[];
};

export type ReuseCandidate = {
  id: string;
  type: 'render' | 'animation' | 'asset';
  tags?: string[];
  characterIds?: string[];
  cameraPreset?: string;
  score?: number;
};

export type PreflightIssue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
};

export type ContinuityFact = {
  id?: string;
  statement: string;
  locked?: boolean;
  importance?: number;
};

export type GuardianResult = {
  score: number;
  threshold: number;
  passed: boolean;
  conflicts: ContinuityFact[];
  warnings: string[];
};

const RENDER_COST_BASE: Record<RenderMode, { costPerSecond: number; minutesPerSecond: number }> = {
  REUSE_EXISTING_RENDER: { costPerSecond: 0.2, minutesPerSecond: 0.05 },
  REUSE_ANIMATION: { costPerSecond: 0.5, minutesPerSecond: 0.12 },
  NATIVE_3D: { costPerSecond: 2.5, minutesPerSecond: 0.8 },
  NATIVE_3D_HIGH: { costPerSecond: 5, minutesPerSecond: 1.5 },
  STILL_IMAGE_MOTION: { costPerSecond: 0.8, minutesPerSecond: 0.2 },
  AI_VIDEO_OPTIONAL: { costPerSecond: 1.8, minutesPerSecond: 0.6 },
  COMPOSITE: { costPerSecond: 2, minutesPerSecond: 0.7 },
};

function calculateCinematicImportance(signal: ProductionShotSignal, mode: ProductionMode) {
  const modeBoost = mode === 'HERO' ? 20 : mode === 'STUDIO' ? 10 : mode === 'ECONOMY' ? -15 : 0;
  const heroBoost = signal.isHeroMoment ? 25 : 0;
  const characterBoost = clamp(signal.characterIds.length * 4, 0, 12);
  const motionBoost = Math.round((signal.motionIntensity - 50) / 5);
  const complexityBoost = Math.round((signal.visualComplexity - 50) / 6);

  return clamp(
    signal.storyImportance + modeBoost + heroBoost + characterBoost + motionBoost + complexityBoost,
    0,
    100,
  );
}

export function assignProductionPlan(
  rawSignal: z.input<typeof ProductionShotSignalSchema>,
  productionMode: ProductionMode = DEFAULT_PRODUCTION_MODE,
): ProductionEstimate {
  const mode = ProductionModeSchema.parse(productionMode);
  const signal = ProductionShotSignalSchema.parse(rawSignal);
  const cinematicImportance = calculateCinematicImportance(signal, signal.requestedMode ?? mode);
  const rationale: string[] = [];
  let renderMode: RenderMode;

  if (signal.reusableRenderId) {
    renderMode = 'REUSE_EXISTING_RENDER';
    rationale.push('Existing approved render can be reused.');
  } else if (signal.reusableAnimationId && signal.motionIntensity <= 70) {
    renderMode = 'REUSE_ANIMATION';
    rationale.push('Reusable animation covers the shot motion.');
  } else if (signal.hasLayeredElements) {
    renderMode = 'COMPOSITE';
    rationale.push('Shot requires layered compositing.');
  } else if (mode === 'ECONOMY' && cinematicImportance < 45) {
    renderMode = 'STILL_IMAGE_MOTION';
    rationale.push('Economy mode and low story importance favor still-image motion.');
  } else if (mode === 'HERO' || cinematicImportance >= 90) {
    renderMode = 'NATIVE_3D_HIGH';
    rationale.push('Hero-level importance merits high-quality native 3D.');
  } else if (signal.hasApproved3dAssets || mode === 'STUDIO' || cinematicImportance >= 60) {
    renderMode = 'NATIVE_3D';
    rationale.push('Approved 3D assets or cinematic priority justify native 3D.');
  } else {
    renderMode = 'AI_VIDEO_OPTIONAL';
    rationale.push('No approved native path is obvious; AI video is optional and review-gated.');
  }

  const base = RENDER_COST_BASE[renderMode];
  const duration = signal.durationSeconds;
  const complexityMultiplier = 1 + signal.visualComplexity / 200;
  const estimatedCostUnits = Number((base.costPerSecond * duration * complexityMultiplier).toFixed(2));
  const estimatedMinutes = Number((base.minutesPerSecond * duration * complexityMultiplier).toFixed(2));

  return {
    renderMode,
    cinematicImportance,
    estimatedCostUnits,
    estimatedMinutes,
    rationale,
  };
}

export function scoreReuseCandidate(
  shot: {
    characterIds?: string[];
    cameraPreset?: string;
    tags?: string[];
    description?: string;
  },
  candidate: ReuseCandidate,
): ReuseCandidate {
  const shotCharacters = new Set(shot.characterIds ?? []);
  const candidateCharacters = new Set(candidate.characterIds ?? []);
  const sharedCharacters = [...shotCharacters].filter((id) => candidateCharacters.has(id)).length;
  const cameraScore = shot.cameraPreset && shot.cameraPreset === candidate.cameraPreset ? 25 : 0;
  const tagScore = (shot.tags ?? []).filter((tag) => candidate.tags?.includes(tag)).length * 10;
  const characterScore = sharedCharacters * 20;
  const descriptionScore =
    shot.description && candidate.tags?.some((tag) => normalizedIncludes(shot.description ?? '', tag))
      ? 10
      : 0;

  return {
    ...candidate,
    score: clamp(cameraScore + tagScore + characterScore + descriptionScore, 0, 100),
  };
}

export function scoreContinuityAgainstCanon(input: {
  text: string;
  canonFacts: ContinuityFact[];
  threshold?: number;
}): GuardianResult {
  const normalized = input.text.toLowerCase();
  const conflicts = input.canonFacts.filter((fact) => {
    if (!fact.locked) return false;
    const statement = fact.statement.trim().toLowerCase();
    return normalized.includes(`not ${statement}`) || normalized.includes(`contradicts ${statement}`);
  });
  const warnings = input.canonFacts
    .filter((fact) => fact.locked && fact.importance && fact.importance >= 90)
    .filter((fact) => !normalizedIncludes(input.text, fact.statement.slice(0, 24)))
    .slice(0, 3)
    .map((fact) => `High-importance canon may need consideration: ${fact.statement}`);

  const score = clamp(100 - conflicts.length * 25 - warnings.length * 3, 0, 100);
  const threshold = input.threshold ?? DOODLE_GUARDIAN_THRESHOLD;

  return {
    score,
    threshold,
    passed: score >= threshold && conflicts.length === 0,
    conflicts,
    warnings,
  };
}

export function runVisualQc(input: {
  continuityScore?: number;
  framingScore?: number;
  lightingScore?: number;
  characterModelScore?: number;
  renderArtifactScore?: number;
  threshold?: number;
}) {
  const threshold = input.threshold ?? VISUAL_QC_THRESHOLD;
  const scores = {
    continuity: input.continuityScore ?? 100,
    framing: input.framingScore ?? 90,
    lighting: input.lightingScore ?? 90,
    characterModel: input.characterModelScore ?? 90,
    renderArtifacts: input.renderArtifactScore ?? 90,
  };
  const weightedScore = Math.round(
    scores.continuity * 0.25 +
      scores.framing * 0.2 +
      scores.lighting * 0.2 +
      scores.characterModel * 0.25 +
      scores.renderArtifacts * 0.1,
  );
  const issues: PreflightIssue[] = Object.entries(scores)
    .filter(([, score]) => score < threshold)
    .map(([key, score]) => ({
      code: `VISUAL_QC_${key.toUpperCase()}_LOW`,
      severity: score < threshold - 15 ? 'error' : 'warning',
      message: `${key} score ${score} is below threshold ${threshold}.`,
    }));

  return {
    score: weightedScore,
    threshold,
    passed: weightedScore >= threshold && !issues.some((issue) => issue.severity === 'error'),
    scores,
    issues,
  };
}

export class ProductionDirectorService {
  defaultMode: ProductionMode = DEFAULT_PRODUCTION_MODE;

  assignRenderMode(signal: z.input<typeof ProductionShotSignalSchema>, mode = this.defaultMode) {
    return assignProductionPlan(signal, mode);
  }

  planEpisode(
    shots: Array<z.input<typeof ProductionShotSignalSchema>>,
    mode: ProductionMode = this.defaultMode,
  ) {
    const shotPlans = shots.map((shot) => ({
      shotId: shot.shotId,
      ...assignProductionPlan(shot, mode),
    }));
    const totals = CostDirectorService.summarizeEstimates(shotPlans);

    return {
      mode,
      shotPlans,
      totals,
    };
  }

  async createRenderJob(input: {
    episodeId?: string;
    shotId?: string;
    signal: z.input<typeof ProductionShotSignalSchema>;
    mode?: ProductionMode;
  }) {
    const estimate = this.assignRenderMode(input.signal, input.mode ?? this.defaultMode);
    return delegate('renderJob').create({
      data: {
        episodeId: input.episodeId ?? null,
        shotId: input.shotId ?? null,
        renderMode: estimate.renderMode,
        status: 'QUEUED',
        cinematicImportance: estimate.cinematicImportance,
        estimatedCostUnits: estimate.estimatedCostUnits,
        estimatedMinutes: estimate.estimatedMinutes,
        rationale: estimate.rationale,
      },
    });
  }

  async updateRenderJobStatus(id: string, status: RenderJobStatus) {
    RenderJobStatusSchema.parse(status);
    return delegate('renderJob').update({ where: { id }, data: { status } });
  }
}

export class CostDirectorService {
  estimateShot(signal: z.input<typeof ProductionShotSignalSchema>, mode?: ProductionMode) {
    return assignProductionPlan(signal, mode ?? DEFAULT_PRODUCTION_MODE);
  }

  estimateEpisode(shots: Array<z.input<typeof ProductionShotSignalSchema>>, mode?: ProductionMode) {
    return CostDirectorService.summarizeEstimates(
      shots.map((shot) => assignProductionPlan(shot, mode ?? DEFAULT_PRODUCTION_MODE)),
    );
  }

  static summarizeEstimates(estimates: ProductionEstimate[]) {
    return estimates.reduce(
      (acc, estimate) => ({
        estimatedCostUnits: Number((acc.estimatedCostUnits + estimate.estimatedCostUnits).toFixed(2)),
        estimatedMinutes: Number((acc.estimatedMinutes + estimate.estimatedMinutes).toFixed(2)),
        averageCinematicImportance:
          estimates.length === 0
            ? 0
            : Math.round(
                (acc.averageCinematicImportance * acc.count + estimate.cinematicImportance) /
                  (acc.count + 1),
              ),
        count: acc.count + 1,
      }),
      { estimatedCostUnits: 0, estimatedMinutes: 0, averageCinematicImportance: 0, count: 0 },
    );
  }
}

export class ReuseEngineService {
  scoreCandidate = scoreReuseCandidate;

  rankCandidates(
    shot: Parameters<typeof scoreReuseCandidate>[0],
    candidates: ReuseCandidate[],
  ) {
    return candidates
      .map((candidate) => scoreReuseCandidate(shot, candidate))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  async findReusableRenders(params: {
    universeId?: string;
    characterIds?: string[];
    tags?: string[];
    cameraPreset?: string;
    limit?: number;
  }) {
    const renderAsset = optionalDelegate('renderAsset');
    if (!renderAsset) return [];

    const candidates = (await renderAsset.findMany({
      where: {
        universeId: params.universeId,
        approved: true,
        ...(params.characterIds?.length ? { characterIds: { hasSome: params.characterIds } } : {}),
      },
      take: clamp(params.limit ?? 10, 1, 50),
      orderBy: { createdAt: 'desc' },
    })) as ReuseCandidate[];

    return this.rankCandidates(
      {
        characterIds: params.characterIds,
        tags: params.tags,
        cameraPreset: params.cameraPreset,
      },
      candidates,
    );
  }
}

export class AssetRequestService {
  async list(params?: { universeId?: string; episodeId?: string; status?: AssetRequestStatus }) {
    return delegate('assetRequest').findMany({
      where: {
        universeId: params?.universeId,
        episodeId: params?.episodeId,
        status: params?.status,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(input: CreateAssetRequestInput) {
    const data = CreateAssetRequestSchema.parse(input);
    return delegate('assetRequest').create({
      data: {
        universeId: data.universeId ?? null,
        episodeId: data.episodeId ?? null,
        shotId: data.shotId ?? null,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        assetType: data.assetType,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
      },
    });
  }

  async updateStatus(id: string, status: AssetRequestStatus) {
    AssetRequestStatusSchema.parse(status);
    return delegate('assetRequest').update({ where: { id }, data: { status } });
  }
}

export class PreflightService {
  async runShotLevel(input: {
    shotId?: string;
    characterIds?: string[];
    renderMode?: RenderMode;
    description?: string;
    durationSeconds?: number;
  }) {
    const issues: PreflightIssue[] = [];
    const renderMode = input.renderMode ? RenderModeSchema.parse(input.renderMode) : undefined;

    if (!input.description?.trim()) {
      issues.push({
        code: 'SHOT_DESCRIPTION_MISSING',
        severity: 'warning',
        message: 'Shot description is empty.',
      });
    }

    if ((input.durationSeconds ?? 0) <= 0) {
      issues.push({
        code: 'SHOT_DURATION_INVALID',
        severity: 'error',
        message: 'Shot duration must be positive.',
      });
    }

    if (
      renderMode === 'NATIVE_3D' ||
      renderMode === 'NATIVE_3D_HIGH' ||
      renderMode === undefined
    ) {
      await Promise.all(
        (input.characterIds ?? []).map(async (characterId) => {
          try {
            await characterPreflightService.assertNativeRenderAllowed(characterId);
          } catch (error) {
            if (error instanceof AppError) {
              issues.push({
                code: error.code,
                severity: 'error',
                message: error.message,
              });
              return;
            }
            throw error;
          }
        }),
      );
    }

    return {
      level: 'SHOT' as const,
      shotId: input.shotId ?? null,
      ok: !issues.some((issue) => issue.severity === 'error'),
      issues,
    };
  }

  async runEpisodeLevel(episodeId: string) {
    const episode = await optionalDelegate('episode')?.findUnique({ where: { id: episodeId } });
    if (!episode) {
      throw new AppError('Episode not found', 'EPISODE_NOT_FOUND', 404);
    }

    const shots = ((await optionalDelegate('shot')?.findMany({
      where: { scene: { episodeId } },
      orderBy: { shotNumber: 'asc' },
    })) ?? []) as Array<{
      id?: string;
      characterIds?: string[];
      renderMode?: RenderMode;
      description?: string;
      durationSeconds?: number;
    }>;

    const shotResults = await Promise.all(
      shots.map((shot) =>
        this.runShotLevel({
          shotId: shot.id,
          characterIds: shot.characterIds,
          renderMode: shot.renderMode,
          description: shot.description,
          durationSeconds: shot.durationSeconds,
        }),
      ),
    );

    const issues = shotResults.flatMap((result) => result.issues);
    if (shots.length === 0) {
      issues.push({
        code: 'EPISODE_HAS_NO_SHOTS',
        severity: 'warning',
        message: 'Episode has no shots available for production preflight.',
      });
    }

    return {
      level: 'EPISODE' as const,
      episodeId,
      ok: !issues.some((issue) => issue.severity === 'error'),
      shotResults,
      issues,
    };
  }
}

export class ContinuityGuardianService {
  threshold = DOODLE_GUARDIAN_THRESHOLD;

  score(input: Parameters<typeof scoreContinuityAgainstCanon>[0]) {
    return scoreContinuityAgainstCanon({ threshold: this.threshold, ...input });
  }

  async scoreEpisode(episodeId: string) {
    const episode = (await optionalDelegate('episode')?.findUnique({
      where: { id: episodeId },
    })) as { universeId?: string; title?: string; logline?: string; synopsis?: string } | null;
    if (!episode?.universeId) {
      throw new AppError('Episode not found', 'EPISODE_NOT_FOUND', 404);
    }

    const canonFacts = await canonService.getRelevantCanon({
      universeId: episode.universeId,
      subjectIds: [episodeId],
      limit: 50,
    });

    return this.score({
      text: [episode.title, episode.logline, episode.synopsis].filter(Boolean).join(' '),
      canonFacts,
    });
  }
}

export class DoodleGuardian extends ContinuityGuardianService {}

export class VisualQcService {
  evaluateShot(input: Parameters<typeof runVisualQc>[0]) {
    return runVisualQc(input);
  }

  async evaluateRenderJob(renderJobId: string, scores: Parameters<typeof runVisualQc>[0]) {
    const result = runVisualQc(scores);
    return {
      renderJobId,
      ...result,
      recommendedStatus: result.passed ? 'APPROVED' : 'QC',
    };
  }
}

export class PublishingService {
  async listByEpisode(episodeId: string) {
    return delegate('publishingRelease').findMany({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRelease(input: PublishReleaseInput) {
    const data = PublishReleaseSchema.parse(input);
    return delegate('publishingRelease').create({
      data: {
        episodeId: data.episodeId,
        title: data.title,
        targetPlatform: data.targetPlatform,
        status: data.status,
        scheduledAt: data.scheduledAt ?? null,
        metadata: data.metadata,
      },
    });
  }

  async updateStatus(id: string, status: PublishingStatus) {
    PublishingStatusSchema.parse(status);
    return delegate('publishingRelease').update({ where: { id }, data: { status } });
  }
}

export class AnalyticsService {
  buildEvent(input: {
    eventName: string;
    entityType: string;
    entityId?: string;
    universeId?: string;
    episodeId?: string;
    properties?: JsonRecord;
  }) {
    return {
      eventName: NonEmptyString.parse(input.eventName),
      entityType: NonEmptyString.parse(input.entityType),
      entityId: input.entityId ?? null,
      universeId: input.universeId ?? null,
      episodeId: input.episodeId ?? null,
      properties: input.properties ?? {},
      occurredAt: new Date(),
    };
  }

  buildEpisodeMetrics(input: {
    episodeId: string;
    renderEstimates?: ProductionEstimate[];
    continuityScore?: number;
    visualQcScore?: number;
    publishedViews?: number;
  }) {
    const costSummary = CostDirectorService.summarizeEstimates(input.renderEstimates ?? []);
    return {
      episodeId: input.episodeId,
      estimatedCostUnits: costSummary.estimatedCostUnits,
      estimatedMinutes: costSummary.estimatedMinutes,
      averageCinematicImportance: costSummary.averageCinematicImportance,
      continuityScore: input.continuityScore ?? null,
      visualQcScore: input.visualQcScore ?? null,
      publishedViews: input.publishedViews ?? 0,
    };
  }
}

export class SearchService {
  async search(params: { universeId: string; query: string; limit?: number }) {
    const query = params.query.trim();
    if (!query) {
      return { characters: [], canon: [], assets: [], episodes: [] };
    }
    const take = clamp(params.limit ?? 10, 1, 50);

    const [characters, canon, assets, episodes] = await Promise.all([
      prisma.character.findMany({
        where: {
          universeId: params.universeId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { internalCode: { contains: query, mode: 'insensitive' } },
            { role: { contains: query, mode: 'insensitive' } },
          ],
        },
        take,
        orderBy: [{ foundingCharacter: 'desc' }, { name: 'asc' }],
      }),
      prisma.canonFact.findMany({
        where: {
          universeId: params.universeId,
          OR: [
            { category: { contains: query, mode: 'insensitive' } },
            { statement: { contains: query, mode: 'insensitive' } },
          ],
        },
        take,
        orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.asset.findMany({
        where: {
          universeId: params.universeId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { entityType: { contains: query, mode: 'insensitive' } },
          ],
        },
        take,
        orderBy: [{ missing: 'desc' }, { createdAt: 'desc' }],
      }),
      optionalDelegate('episode')?.findMany({
        where: {
          universeId: params.universeId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { logline: { contains: query, mode: 'insensitive' } },
            { synopsis: { contains: query, mode: 'insensitive' } },
          ],
        },
        take,
        orderBy: [{ episodeNumber: 'asc' }],
      }) ?? [],
    ]);

    return { characters, canon, assets, episodes };
  }
}

export class BackupExportService {
  async exportUniverseSnapshot(universeId: string) {
    const universe = await prisma.universe.findUnique({ where: { id: universeId } });
    if (!universe) {
      throw new AppError('Universe not found', 'UNIVERSE_NOT_FOUND', 404);
    }

    const [characters, canon, assets, seasons, episodes, renderJobs] = await Promise.all([
      prisma.character.findMany({
        where: { universeId },
        include: {
          visualDna: true,
          personalityDna: true,
          motionDna: true,
          voiceDna: true,
          storyDna: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.canonFact.findMany({
        where: { universeId },
        orderBy: [{ locked: 'desc' }, { importance: 'desc' }],
      }),
      prisma.asset.findMany({
        where: { universeId },
        orderBy: [{ missing: 'desc' }, { createdAt: 'desc' }],
      }),
      optionalDelegate('season')?.findMany({
        where: { universeId },
        orderBy: { seasonNumber: 'asc' },
      }) ?? [],
      optionalDelegate('episode')?.findMany({
        where: { universeId },
        orderBy: { episodeNumber: 'asc' },
      }) ?? [],
      optionalDelegate('renderJob')?.findMany({
        where: { episode: { universeId } },
        orderBy: { createdAt: 'desc' },
      }) ?? [],
    ]);

    return {
      exportedAt: new Date().toISOString(),
      format: 'doodle-dash-studio-backup-v1',
      universe,
      characters,
      canon,
      assets,
      seasons,
      episodes,
      renderJobs,
    };
  }
}

export class NextEpisodeOrchestrator {
  async createNextEpisodeProposal(params: { universeId: string; seasonId?: string }) {
    const [universe, foundingCharacters, canon, openThreads, previousEpisode] = await Promise.all([
      prisma.universe.findUnique({ where: { id: params.universeId } }),
      prisma.character.findMany({
        where: {
          universeId: params.universeId,
          internalCode: { in: [FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT] },
        },
        include: {
          storyDna: true,
          personalityDna: true,
          development: true,
          relationshipsFrom: { take: 5 },
          relationshipsTo: { take: 5 },
        },
        orderBy: { internalCode: 'asc' },
      }),
      prisma.canonFact.findMany({
        where: { universeId: params.universeId, locked: true },
        orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
        take: 12,
      }),
      optionalDelegate('storyThread')?.findMany({
        where: {
          universeId: params.universeId,
          status: { in: ['OPEN', 'PLANTED'] },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 5,
      }) ?? [],
      optionalDelegate('episode')?.findFirst({
        where: {
          universeId: params.universeId,
          seasonId: params.seasonId,
        },
        orderBy: { episodeNumber: 'desc' },
      }) ?? null,
    ]);

    if (!universe) {
      throw new AppError('Universe not found', 'UNIVERSE_NOT_FOUND', 404);
    }

    const previous = previousEpisode as { episodeNumber?: number; title?: string } | null;
    const nextEpisodeNumber = (previous?.episodeNumber ?? 0) + 1;
    const pip = foundingCharacters.find((character) => character.internalCode === FOUNDING_CODES.PIP);
    const goat = foundingCharacters.find((character) => character.internalCode === FOUNDING_CODES.GOAT);
    const primaryThread = (openThreads[0] ?? null) as { id?: string; title?: string; summary?: string } | null;

    return {
      universeId: params.universeId,
      seasonId: params.seasonId ?? null,
      episodeNumber: nextEpisodeNumber,
      title: `Pip and Goat Episode ${nextEpisodeNumber}`,
      logline: primaryThread
        ? `Pip and Goat explore "${primaryThread.title}" through a safe, playful problem.`
        : 'Pip and Goat discover a small problem, try a playful solution, and turn it into a kind lesson.',
      noAiCallMade: true,
      requiresHumanApproval: true,
      loadedContext: {
        universe: {
          id: universe.id,
          name: universe.name,
          brandName: universe.brandName,
          targetAudience: universe.targetAudience,
          worldDescription: universe.worldDescription,
        },
        pip: pip
          ? {
              id: pip.id,
              name: pip.name,
              storyDna: pip.storyDna,
              personalityDna: pip.personalityDna,
              development: pip.development,
            }
          : null,
        goat: goat
          ? {
              id: goat.id,
              name: goat.name,
              storyDna: goat.storyDna,
              personalityDna: goat.personalityDna,
              development: goat.development,
            }
          : null,
        lockedCanonAnchors: canon.map((fact) => ({
          id: fact.id,
          category: fact.category,
          statement: fact.statement,
          importance: fact.importance,
        })),
        openThreads,
        previousEpisodeTitle: previous?.title ?? null,
      },
      structuredProposal: {
        acts: [
          {
            label: 'Act 1',
            purpose: 'Set up a tiny, relatable problem.',
            beats: ['Pip notices the problem.', 'Goat names a careful first step.'],
          },
          {
            label: 'Act 2',
            purpose: 'Let the friends try, fail safely, and learn.',
            beats: ['The first solution is playful but incomplete.', 'A canon-safe clue reframes the challenge.'],
          },
          {
            label: 'Act 3',
            purpose: 'Resolve with kindness and a preschool-readable lesson.',
            beats: ['Pip and Goat use the lesson together.', 'A gentle callback closes the episode.'],
          },
        ],
        requiredCharacters: compact([pip?.id, goat?.id]),
        storyThreadId: primaryThread?.id ?? null,
        productionDefaults: {
          mode: DEFAULT_PRODUCTION_MODE,
          cameraPreset: 'storyMedium',
          lightingPreset: 'sunnyPlayroom',
          guardianThreshold: DOODLE_GUARDIAN_THRESHOLD,
        },
      },
    };
  }
}

export const productionDirectorService = new ProductionDirectorService();
export const costDirectorService = new CostDirectorService();
export const reuseEngineService = new ReuseEngineService();
export const assetRequestService = new AssetRequestService();
export const preflightService = new PreflightService();
export const continuityGuardianService = new ContinuityGuardianService();
export const doodleGuardian = new DoodleGuardian();
export const visualQcService = new VisualQcService();
export const publishingService = new PublishingService();
export const analyticsService = new AnalyticsService();
export const searchService = new SearchService();
export const backupExportService = new BackupExportService();
export const nextEpisodeOrchestrator = new NextEpisodeOrchestrator();

export * from './readiness';
export * from './launch-prep';
export * from './cost-optimized-production';
export * from './canonical-characters';
export * from './production-setup';
export * from './episode-render';
export * from './performance';
export * from './audit-fast';
export * from './cloud';
export * from './direction-service';
export * from './pip-replacement-intake';
export * from './pip-visual-identity';
export * from './pip-production-conversion';
export * from './asset-manifest';
export * from './canon-reference';
export * from './lookdev-presets';
export * from './recovery-ledger';
