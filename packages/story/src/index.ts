import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
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
  delete?(args: JsonRecord): Promise<unknown>;
};

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

function includesAny(source: string, needles: string[]) {
  const normalized = source.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

const UUID = z.string().uuid();
const NonEmptyString = z.string().trim().min(1);
const StoryStatusSchema = z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'LOCKED']);

export const CreateSeasonProposalSchema = z.object({
  universeId: UUID,
  seasonNumber: z.number().int().positive(),
  title: NonEmptyString,
  logline: NonEmptyString,
  theme: z.string().trim().optional(),
  targetEpisodeCount: z.number().int().positive().default(10),
  proposalNotes: z.string().trim().optional(),
});

export const CreateEpisodeSchema = z.object({
  universeId: UUID,
  seasonId: UUID.optional(),
  episodeNumber: z.number().int().positive(),
  title: NonEmptyString,
  logline: NonEmptyString,
  synopsis: z.string().trim().optional(),
  status: StoryStatusSchema.default('DRAFT'),
});

export const CreateStoryThreadSchema = z.object({
  universeId: UUID,
  seasonId: UUID.optional(),
  episodeId: UUID.optional(),
  title: NonEmptyString,
  summary: NonEmptyString,
  priority: z.number().int().min(0).max(100).default(50),
  status: z.enum(['OPEN', 'PLANTED', 'PAYING_OFF', 'RESOLVED', 'DROPPED']).default('OPEN'),
});

export const CreateForeshadowingSchema = z.object({
  universeId: UUID,
  threadId: UUID.optional(),
  plantedEpisodeId: UUID.optional(),
  payoffEpisodeId: UUID.optional(),
  clue: NonEmptyString,
  intendedPayoff: NonEmptyString,
  subtlety: z.number().int().min(0).max(100).default(60),
  status: z.enum(['PLANNED', 'PLANTED', 'PAID_OFF', 'RETIRED']).default('PLANNED'),
});

export const CreateStoryboardSchema = z.object({
  episodeId: UUID,
  title: NonEmptyString,
  version: z.number().int().positive().default(1),
  status: StoryStatusSchema.default('DRAFT'),
  notes: z.string().trim().optional(),
});

export const CreateSceneSchema = z.object({
  episodeId: UUID,
  storyboardId: UUID.optional(),
  sceneNumber: z.number().int().positive(),
  title: NonEmptyString,
  description: NonEmptyString,
  locationId: UUID.optional(),
  characterIds: z.array(UUID).default([]),
  emotionalBeat: z.string().trim().optional(),
});

export const CreateShotSchema = z.object({
  sceneId: UUID,
  shotNumber: z.number().int().positive(),
  description: NonEmptyString,
  cameraPreset: z.string().trim().optional(),
  lightingPreset: z.string().trim().optional(),
  durationSeconds: z.number().positive().default(4),
  characterIds: z.array(UUID).default([]),
  productionNotes: z.string().trim().optional(),
});

export type CreateSeasonProposalInput = z.infer<typeof CreateSeasonProposalSchema>;
export type CreateEpisodeInput = z.infer<typeof CreateEpisodeSchema>;
export type CreateStoryThreadInput = z.infer<typeof CreateStoryThreadSchema>;
export type CreateForeshadowingInput = z.infer<typeof CreateForeshadowingSchema>;
export type CreateStoryboardInput = z.infer<typeof CreateStoryboardSchema>;
export type CreateSceneInput = z.infer<typeof CreateSceneSchema>;
export type CreateShotInput = z.infer<typeof CreateShotSchema>;

export type MemoryCandidate = {
  universeId: string;
  episodeId?: string;
  subjectType: 'EPISODE' | 'CHARACTER' | 'LOCATION' | 'PROP' | 'GENERAL';
  subjectId?: string;
  statement: string;
  importance: number;
  source: string;
  lockedCanonMutation: false;
};

export type UniverseContextRequest = {
  universeId: string;
  episodeId?: string;
  characterIds?: string[];
  locationIds?: string[];
  limit?: number;
};

export type CameraPreset = {
  code: string;
  label: string;
  lensMm: number;
  shotSize: 'WIDE' | 'MEDIUM' | 'CLOSE_UP' | 'EXTREME_CLOSE_UP';
  movement: 'LOCKED' | 'PAN' | 'DOLLY' | 'HANDHELD' | 'CRANE';
  emotionalUse: string;
};

export type CameraRuleIssue = {
  code: string;
  severity: 'warning' | 'error';
  message: string;
};

export type CameraRuleInput = {
  presetCode?: string;
  lensMm?: number;
  shotSize?: CameraPreset['shotSize'];
  movement?: CameraPreset['movement'];
  durationSeconds?: number;
  subjectCount?: number;
  isDialogue?: boolean;
  consecutiveCloseUps?: number;
};

export type LightingPreset = {
  code: string;
  label: string;
  key: string;
  fill: string;
  rim: string;
  palette: string[];
  mood: string;
};

export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  establishingWide: {
    code: 'establishingWide',
    label: 'Establishing wide',
    lensMm: 24,
    shotSize: 'WIDE',
    movement: 'CRANE',
    emotionalUse: 'Introduce geography and playful scale.',
  },
  storyMedium: {
    code: 'storyMedium',
    label: 'Story medium',
    lensMm: 35,
    shotSize: 'MEDIUM',
    movement: 'LOCKED',
    emotionalUse: 'Clear character action and dialogue.',
  },
  wonderDolly: {
    code: 'wonderDolly',
    label: 'Wonder dolly',
    lensMm: 32,
    shotSize: 'MEDIUM',
    movement: 'DOLLY',
    emotionalUse: 'Push into a discovery or magical reveal.',
  },
  heroCloseUp: {
    code: 'heroCloseUp',
    label: 'Hero close-up',
    lensMm: 55,
    shotSize: 'CLOSE_UP',
    movement: 'LOCKED',
    emotionalUse: 'Hold on a decision, lesson, or heartfelt turn.',
  },
};

export const LIGHTING_PRESETS: Record<string, LightingPreset> = {
  sunnyPlayroom: {
    code: 'sunnyPlayroom',
    label: 'Sunny playroom',
    key: 'large soft warm key from upper left',
    fill: 'gentle bounce fill',
    rim: 'subtle golden rim',
    palette: ['warm cream', 'soft yellow', 'sky blue'],
    mood: 'safe, cheerful, preschool-friendly',
  },
  twilightWonder: {
    code: 'twilightWonder',
    label: 'Twilight wonder',
    key: 'cool violet-blue key',
    fill: 'low cyan ambience',
    rim: 'sparkle rim on silhouettes',
    palette: ['lavender', 'deep blue', 'mint'],
    mood: 'curious and magical without becoming scary',
  },
  cozyLesson: {
    code: 'cozyLesson',
    label: 'Cozy lesson',
    key: 'soft amber key',
    fill: 'warm wraparound fill',
    rim: 'minimal peach rim',
    palette: ['amber', 'peach', 'soft brown'],
    mood: 'calm, reflective, emotionally safe',
  },
};

export function checkCameraRules(input: CameraRuleInput): CameraRuleIssue[] {
  const preset = input.presetCode ? CAMERA_PRESETS[input.presetCode] : undefined;
  const lensMm = input.lensMm ?? preset?.lensMm;
  const shotSize = input.shotSize ?? preset?.shotSize;
  const movement = input.movement ?? preset?.movement;
  const durationSeconds = input.durationSeconds ?? 4;
  const subjectCount = input.subjectCount ?? 1;
  const issues: CameraRuleIssue[] = [];

  if (lensMm !== undefined && lensMm < 20) {
    issues.push({
      code: 'LENS_TOO_WIDE_FOR_CHARACTERS',
      severity: 'warning',
      message: 'Avoid ultra-wide lenses on Doodle Dash characters unless the shot is clearly comedic.',
    });
  }

  if (shotSize === 'EXTREME_CLOSE_UP' && subjectCount > 1) {
    issues.push({
      code: 'TOO_MANY_SUBJECTS_FOR_EXTREME_CLOSEUP',
      severity: 'error',
      message: 'Extreme close-ups should isolate a single emotional subject.',
    });
  }

  if (input.isDialogue && movement === 'HANDHELD') {
    issues.push({
      code: 'HANDHELD_DIALOGUE',
      severity: 'warning',
      message: 'Dialogue shots should stay readable; prefer locked, pan, or gentle dolly movement.',
    });
  }

  if (durationSeconds < 1.5 && shotSize === 'CLOSE_UP') {
    issues.push({
      code: 'CLOSEUP_TOO_SHORT',
      severity: 'warning',
      message: 'Close-ups need enough screen time for preschool viewers to read the emotion.',
    });
  }

  if ((input.consecutiveCloseUps ?? 0) >= 3 && shotSize === 'CLOSE_UP') {
    issues.push({
      code: 'CLOSEUP_RHYTHM_FATIGUE',
      severity: 'warning',
      message: 'Break long close-up runs with a medium or wide shot for visual rhythm.',
    });
  }

  return issues;
}

export function extractEpisodeMemoryCandidates(input: {
  universeId: string;
  episodeId?: string;
  episodeTitle?: string;
  synopsis?: string;
  beats?: string[];
  characterIds?: string[];
  locationIds?: string[];
}): MemoryCandidate[] {
  const statements = compact([
    input.synopsis ? `${input.episodeTitle ?? 'Episode'} synopsis: ${input.synopsis}` : null,
    ...(input.beats ?? []).map((beat, index) => `Beat ${index + 1}: ${beat}`),
  ]);

  return statements
    .filter((statement) => statement.trim().length > 0)
    .slice(0, 20)
    .map((statement, index) => ({
      universeId: input.universeId,
      episodeId: input.episodeId,
      subjectType: 'EPISODE' as const,
      statement,
      importance: clamp(70 - index * 2, 25, 80),
      source: 'episode_extract',
      lockedCanonMutation: false as const,
    }));
}

export class SeasonService {
  async list(universeId: string) {
    return delegate('season').findMany({
      where: { universeId },
      orderBy: [{ seasonNumber: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async get(id: string) {
    const season = await delegate('season').findUnique({
      where: { id },
      include: { episodes: { orderBy: { episodeNumber: 'asc' } } },
    });
    if (!season) {
      throw new AppError('Season not found', 'SEASON_NOT_FOUND', 404);
    }
    return season;
  }

  async create(input: CreateSeasonProposalInput) {
    return this.createDraftProposal(input);
  }

  async createDraftProposal(input: CreateSeasonProposalInput) {
    const data = CreateSeasonProposalSchema.parse(input);
    return delegate('season').create({
      data: {
        universeId: data.universeId,
        seasonNumber: data.seasonNumber,
        title: data.title,
        logline: data.logline,
        theme: data.theme ?? null,
        targetEpisodeCount: data.targetEpisodeCount,
        status: 'DRAFT',
        approvalStatus: 'PENDING_APPROVAL',
        approvedForProduction: false,
        proposal: {
          type: 'SEASON_PROPOSAL',
          requiresApprovalBeforeProduction: true,
          notes: data.proposalNotes ?? null,
        },
      },
    });
  }

  async assertApprovedForProduction(id: string) {
    const season = (await this.get(id)) as { approvedForProduction?: boolean; status?: string };
    if (!season.approvedForProduction && season.status !== 'APPROVED') {
      throw new AppError(
        'Season proposal requires approval before production.',
        'SEASON_APPROVAL_REQUIRED',
        409,
      );
    }
    return season;
  }
}

export class EpisodeService {
  async list(params: { universeId?: string; seasonId?: string }) {
    return delegate('episode').findMany({
      where: {
        universeId: params.universeId,
        seasonId: params.seasonId,
      },
      orderBy: [{ episodeNumber: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async get(id: string) {
    const episode = await delegate('episode').findUnique({
      where: { id },
      include: {
        scenes: { orderBy: { sceneNumber: 'asc' } },
        storyboard: true,
      },
    });
    if (!episode) {
      throw new AppError('Episode not found', 'EPISODE_NOT_FOUND', 404);
    }
    return episode;
  }

  async create(input: CreateEpisodeInput) {
    const data = CreateEpisodeSchema.parse(input);
    return delegate('episode').create({
      data: {
        universeId: data.universeId,
        seasonId: data.seasonId ?? null,
        episodeNumber: data.episodeNumber,
        title: data.title,
        logline: data.logline,
        synopsis: data.synopsis ?? null,
        status: data.status,
      },
    });
  }

  async updateStatus(id: string, status: z.infer<typeof StoryStatusSchema>) {
    StoryStatusSchema.parse(status);
    return delegate('episode').update({ where: { id }, data: { status } });
  }
}

export class StoryThreadService {
  async list(params: { universeId: string; seasonId?: string; episodeId?: string; status?: string }) {
    return delegate('storyThread').findMany({
      where: {
        universeId: params.universeId,
        seasonId: params.seasonId,
        episodeId: params.episodeId,
        status: params.status,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async get(id: string) {
    const thread = await delegate('storyThread').findUnique({ where: { id } });
    if (!thread) {
      throw new AppError('Story thread not found', 'STORY_THREAD_NOT_FOUND', 404);
    }
    return thread;
  }

  async create(input: CreateStoryThreadInput) {
    const data = CreateStoryThreadSchema.parse(input);
    return delegate('storyThread').create({
      data: {
        universeId: data.universeId,
        seasonId: data.seasonId ?? null,
        episodeId: data.episodeId ?? null,
        title: data.title,
        summary: data.summary,
        priority: data.priority,
        status: data.status,
      },
    });
  }
}

export class ForeshadowingService {
  async list(params: { universeId: string; threadId?: string; status?: string }) {
    return delegate('foreshadowing').findMany({
      where: {
        universeId: params.universeId,
        threadId: params.threadId,
        status: params.status,
      },
      orderBy: [{ subtlety: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(input: CreateForeshadowingInput) {
    const data = CreateForeshadowingSchema.parse(input);
    return delegate('foreshadowing').create({
      data: {
        universeId: data.universeId,
        threadId: data.threadId ?? null,
        plantedEpisodeId: data.plantedEpisodeId ?? null,
        payoffEpisodeId: data.payoffEpisodeId ?? null,
        clue: data.clue,
        intendedPayoff: data.intendedPayoff,
        subtlety: data.subtlety,
        status: data.status,
      },
    });
  }
}

export class EpisodeMemoryService {
  extractCandidates(input: Parameters<typeof extractEpisodeMemoryCandidates>[0]) {
    return extractEpisodeMemoryCandidates(input);
  }

  async listCandidates(episodeId: string) {
    return delegate('episodeMemory').findMany({
      where: { episodeId },
      orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async persistCandidates(candidates: MemoryCandidate[]) {
    if (candidates.some((candidate) => candidate.lockedCanonMutation !== false)) {
      throw new AppError(
        'Episode memory extraction cannot mutate locked canon.',
        'LOCKED_CANON_MUTATION_BLOCKED',
        409,
      );
    }

    const memory = delegate('episodeMemory');
    return Promise.all(
      candidates.map((candidate) =>
        memory.create({
          data: {
            universeId: candidate.universeId,
            episodeId: candidate.episodeId ?? null,
            subjectType: candidate.subjectType,
            subjectId: candidate.subjectId ?? null,
            statement: candidate.statement,
            importance: candidate.importance,
            source: candidate.source,
            status: 'CANDIDATE',
            lockedCanonMutation: false,
          },
        }),
      ),
    );
  }
}

export class ContextRetrievalService {
  async buildRelevantUniverseContext(params: UniverseContextRequest) {
    const limit = clamp(params.limit ?? 24, 4, 100);
    const perBucket = clamp(Math.ceil(limit / 4), 3, 25);
    const subjectIds = [
      ...(params.characterIds ?? []),
      ...(params.locationIds ?? []),
      ...(params.episodeId ? [params.episodeId] : []),
    ];

    const [universe, episode, characters, locations, canon, threads, memories] =
      await Promise.all([
        prisma.universe.findUnique({
          where: { id: params.universeId },
          select: {
            id: true,
            name: true,
            brandName: true,
            description: true,
            targetAudience: true,
            worldDescription: true,
            defaultOutputFormat: true,
          },
        }),
        params.episodeId
          ? optionalDelegate('episode')?.findUnique({ where: { id: params.episodeId } }) ?? null
          : null,
        prisma.character.findMany({
          where: {
            universeId: params.universeId,
            ...(params.characterIds?.length ? { id: { in: params.characterIds } } : {}),
          },
          include: {
            visualDna: true,
            personalityDna: true,
            motionDna: true,
            voiceDna: true,
            storyDna: true,
            relationshipsFrom: { take: 5 },
            relationshipsTo: { take: 5 },
          },
          orderBy: [{ foundingCharacter: 'desc' }, { name: 'asc' }],
          take: params.characterIds?.length ? undefined : perBucket,
        }),
        optionalDelegate('location')?.findMany({
          where: {
            universeId: params.universeId,
            ...(params.locationIds?.length ? { id: { in: params.locationIds } } : {}),
          },
          orderBy: [{ importance: 'desc' }, { name: 'asc' }],
          take: params.locationIds?.length ? undefined : perBucket,
        }) ?? [],
        prisma.canonFact.findMany({
          where: {
            universeId: params.universeId,
            ...(subjectIds.length
              ? {
                  OR: [
                    { subjectId: { in: subjectIds } },
                    { subjectType: { in: ['UNIVERSE', 'GENERAL'] } },
                  ],
                }
              : {}),
          },
          orderBy: [{ importance: 'desc' }, { locked: 'desc' }, { createdAt: 'asc' }],
          take: perBucket * 2,
        }),
        optionalDelegate('storyThread')?.findMany({
          where: {
            universeId: params.universeId,
            ...(params.episodeId ? { episodeId: params.episodeId } : {}),
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          take: perBucket,
        }) ?? [],
        optionalDelegate('episodeMemory')?.findMany({
          where: {
            universeId: params.universeId,
            ...(params.episodeId ? { episodeId: params.episodeId } : {}),
          },
          orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
          take: perBucket,
        }) ?? [],
      ]);

    if (!universe) {
      throw new AppError('Universe not found', 'UNIVERSE_NOT_FOUND', 404);
    }

    return {
      universe,
      episode,
      characters,
      locations,
      canon,
      storyThreads: threads,
      episodeMemories: memories,
      meta: {
        requestedLimit: params.limit,
        appliedLimit: limit,
        relevantOnly: true,
      },
    };
  }
}

export class StoryboardService {
  async listByEpisode(episodeId: string) {
    return delegate('storyboard').findMany({
      where: { episodeId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(input: CreateStoryboardInput) {
    const data = CreateStoryboardSchema.parse(input);
    return delegate('storyboard').create({
      data: {
        episodeId: data.episodeId,
        title: data.title,
        version: data.version,
        status: data.status,
        notes: data.notes ?? null,
      },
    });
  }
}

export class SceneService {
  async listByEpisode(episodeId: string) {
    return delegate('scene').findMany({
      where: { episodeId },
      include: { shots: { orderBy: { shotNumber: 'asc' } } },
      orderBy: { sceneNumber: 'asc' },
    });
  }

  async get(id: string) {
    const scene = await delegate('scene').findUnique({
      where: { id },
      include: { shots: { orderBy: { shotNumber: 'asc' } } },
    });
    if (!scene) {
      throw new AppError('Scene not found', 'SCENE_NOT_FOUND', 404);
    }
    return scene;
  }

  async create(input: CreateSceneInput) {
    const data = CreateSceneSchema.parse(input);
    return delegate('scene').create({
      data: {
        episodeId: data.episodeId,
        storyboardId: data.storyboardId ?? null,
        sceneNumber: data.sceneNumber,
        title: data.title,
        description: data.description,
        locationId: data.locationId ?? null,
        characterIds: data.characterIds,
        emotionalBeat: data.emotionalBeat ?? null,
      },
    });
  }
}

export class ShotService {
  async listByScene(sceneId: string) {
    return delegate('shot').findMany({
      where: { sceneId },
      orderBy: { shotNumber: 'asc' },
    });
  }

  async get(id: string) {
    const shot = await delegate('shot').findUnique({ where: { id } });
    if (!shot) {
      throw new AppError('Shot not found', 'SHOT_NOT_FOUND', 404);
    }
    return shot;
  }

  async create(input: CreateShotInput) {
    const data = CreateShotSchema.parse(input);
    const cameraIssues = checkCameraRules({
      presetCode: data.cameraPreset,
      durationSeconds: data.durationSeconds,
      subjectCount: data.characterIds.length,
    });
    if (cameraIssues.some((issue) => issue.severity === 'error')) {
      throw new AppError(
        'Shot violates cinematic camera rules.',
        'CAMERA_RULE_BLOCKED',
        400,
      );
    }

    return delegate('shot').create({
      data: {
        sceneId: data.sceneId,
        shotNumber: data.shotNumber,
        description: data.description,
        cameraPreset: data.cameraPreset ?? 'storyMedium',
        lightingPreset: data.lightingPreset ?? 'sunnyPlayroom',
        durationSeconds: data.durationSeconds,
        characterIds: data.characterIds,
        productionNotes: data.productionNotes ?? null,
        cameraRuleIssues: cameraIssues,
      },
    });
  }
}

export class CameraDirectorService {
  presets = CAMERA_PRESETS;

  listPresets() {
    return Object.values(CAMERA_PRESETS);
  }

  getPreset(code: string) {
    const preset = CAMERA_PRESETS[code];
    if (!preset) {
      throw new AppError('Camera preset not found', 'CAMERA_PRESET_NOT_FOUND', 404);
    }
    return preset;
  }

  choosePreset(input: { emotionalBeat?: string; subjectCount?: number; action?: string }) {
    const text = [input.emotionalBeat, input.action].filter(Boolean).join(' ');
    if (includesAny(text, ['discover', 'wonder', 'reveal', 'magical'])) {
      return CAMERA_PRESETS.wonderDolly;
    }
    if (includesAny(text, ['decide', 'lesson', 'sorry', 'brave', 'heart'])) {
      return CAMERA_PRESETS.heroCloseUp;
    }
    if ((input.subjectCount ?? 1) > 3) {
      return CAMERA_PRESETS.establishingWide;
    }
    return CAMERA_PRESETS.storyMedium;
  }

  checkRules(input: CameraRuleInput) {
    return checkCameraRules(input);
  }
}

export class LightingDirectorService {
  presets = LIGHTING_PRESETS;

  listPresets() {
    return Object.values(LIGHTING_PRESETS);
  }

  getPreset(code: string) {
    const preset = LIGHTING_PRESETS[code];
    if (!preset) {
      throw new AppError('Lighting preset not found', 'LIGHTING_PRESET_NOT_FOUND', 404);
    }
    return preset;
  }

  choosePreset(input: { mood?: string; timeOfDay?: string; lessonBeat?: boolean }) {
    const text = [input.mood, input.timeOfDay].filter(Boolean).join(' ');
    if (input.lessonBeat || includesAny(text, ['calm', 'lesson', 'cozy', 'safe'])) {
      return LIGHTING_PRESETS.cozyLesson;
    }
    if (includesAny(text, ['twilight', 'night', 'wonder', 'magic'])) {
      return LIGHTING_PRESETS.twilightWonder;
    }
    return LIGHTING_PRESETS.sunnyPlayroom;
  }
}

export class NextEpisodeOrchestrator {
  async createNextEpisodeProposal(params: { universeId: string; seasonId?: string }) {
    const [universe, foundingCharacters, canon, previousEpisode] = await Promise.all([
      prisma.universe.findUnique({ where: { id: params.universeId } }),
      prisma.character.findMany({
        where: {
          universeId: params.universeId,
          internalCode: { in: [FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT] },
        },
        include: {
          storyDna: true,
          personalityDna: true,
        },
        orderBy: { internalCode: 'asc' },
      }),
      prisma.canonFact.findMany({
        where: { universeId: params.universeId, locked: true },
        orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
        take: 12,
      }),
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

    return {
      universeId: params.universeId,
      seasonId: params.seasonId ?? null,
      episodeNumber: nextEpisodeNumber,
      title: `Pip and Goat Episode ${nextEpisodeNumber}`,
      logline: 'Pip and Goat discover a small problem, try a playful solution, and turn it into a kind lesson.',
      requiresHumanApproval: true,
      noAiGeneratedContent: true,
      deterministicScaffold: true,
      loadedContext: {
        universe: {
          id: universe.id,
          name: universe.name,
          brandName: universe.brandName,
          targetAudience: universe.targetAudience,
        },
        foundingCharacters: compact([pip, goat]).map((character) => ({
          id: character.id,
          internalCode: character.internalCode,
          name: character.name,
          storyDna: character.storyDna,
          personalityDna: character.personalityDna,
        })),
        lockedCanonAnchors: canon.map((fact) => ({
          id: fact.id,
          category: fact.category,
          statement: fact.statement,
          importance: fact.importance,
        })),
        previousEpisodeTitle: previous?.title ?? null,
      },
      proposedBeats: [
        'Cold open: Pip notices something delightful but slightly confusing.',
        'Goat offers a careful plan that makes the challenge feel safe.',
        'The friends test a playful idea and learn what does not work.',
        'A canon-safe discovery points them toward the kinder solution.',
        'Resolution: Pip and Goat celebrate the lesson and leave a gentle hook for the next episode.',
      ],
      productionNotes: {
        preferredCameraPreset: 'storyMedium',
        preferredLightingPreset: 'sunnyPlayroom',
        expectedRenderMode: 'BALANCED_CINEMATIC',
      },
    };
  }
}

export const seasonService = new SeasonService();
export const episodeService = new EpisodeService();
export const storyThreadService = new StoryThreadService();
export const foreshadowingService = new ForeshadowingService();
export const episodeMemoryService = new EpisodeMemoryService();
export const contextRetrievalService = new ContextRetrievalService();
export const storyboardService = new StoryboardService();
export const sceneService = new SceneService();
export const shotService = new ShotService();
export const cameraDirectorService = new CameraDirectorService();
export const lightingDirectorService = new LightingDirectorService();
export const nextEpisodeOrchestrator = new NextEpisodeOrchestrator();
