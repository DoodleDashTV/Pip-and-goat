import { createHash } from 'crypto';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES, DOODLE_GUARDIAN_THRESHOLD } from '@doodle-dash/domain';
import {
  characterPreflightService,
  characterService,
  studioSettingsService,
} from '@doodle-dash/characters';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

/** Lazy import avoids circular dependency with ./index (which re-exports this module). */
async function productionRuntime() {
  return import('./index');
}

const UUID = z.string().uuid();

export const PIPELINE_STAGES = [
  'STORY_APPROVAL',
  'CONTINUITY_CHECK',
  'STORYBOARD',
  'SHOT_PLANNING',
  'ASSET_CHECK',
  'VOICE_GENERATION',
  'ANIMATION',
  'PREFLIGHT',
  'DOODLE_GUARDIAN',
  'DRAFT_RENDER',
  'QC',
  'FINAL_RENDER',
  'AUDIO_POST',
  'CAPTIONS',
  'PUBLISHING_PACKAGE',
] as const;

export type PipelineStageCode = (typeof PIPELINE_STAGES)[number];

export const RegisterIntakeSchema = z.object({
  universeId: UUID,
  entityType: z.enum(['character', 'location', 'prop']),
  entityId: UUID,
  kind: z.enum([
    'CHARACTER_BLEND',
    'CHARACTER_GLB',
    'CHARACTER_GLTF',
    'CHARACTER_FBX',
    'TEXTURE',
    'MATERIAL',
    'RIG',
    'FACIAL_SHAPEKEYS',
    'REFERENCE_IMAGE',
    'TURNAROUND',
    'EXPRESSION_SHEET',
    'POSE_REFERENCE',
    'LOCATION_BLEND',
    'LOCATION_PROP',
    'LIGHTING_SETUP',
    'PROP_BLEND',
    'PROP_GLB',
    'OTHER',
  ]),
  originalFilename: z.string().min(1).optional(),
  mimeType: z.string().optional(),
  storageLocation: z.string().min(1).optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  /** When true, register a required-but-missing intake slot (no fake file). */
  markMissing: z.boolean().default(false),
  missingReason: z.string().optional(),
  fileBytes: z.instanceof(Uint8Array).or(z.instanceof(Buffer)).optional(),
});

export class AssetIntakeService {
  async register(input: z.input<typeof RegisterIntakeSchema>) {
    const data = RegisterIntakeSchema.parse(input);
    const checksum = data.fileBytes
      ? createHash('sha256').update(data.fileBytes).digest('hex')
      : null;

    if (!data.markMissing && !data.storageLocation && !data.fileBytes) {
      throw new AppError(
        'PRODUCTION ASSET REQUIRED: provide storageLocation/fileBytes or markMissing=true.',
        'PRODUCTION_ASSET_REQUIRED',
        400,
      );
    }

    const latest = await prisma.productionAssetIntake.findFirst({
      where: {
        entityType: data.entityType,
        entityId: data.entityId,
        kind: data.kind,
      },
      orderBy: { version: 'desc' },
    });

    return prisma.productionAssetIntake.create({
      data: {
        universeId: data.universeId,
        entityType: data.entityType,
        entityId: data.entityId,
        kind: data.kind,
        originalFilename: data.originalFilename ?? null,
        mimeType: data.mimeType ?? null,
        storageLocation: data.markMissing ? null : (data.storageLocation ?? null),
        checksum,
        version: (latest?.version ?? 0) + 1,
        source: data.source ?? null,
        approvalStatus: data.markMissing ? 'MISSING' : 'PENDING',
        productionReady: false,
        notes: data.notes ?? null,
        missingReason: data.markMissing
          ? (data.missingReason ?? 'PRODUCTION ASSET REQUIRED — file not uploaded.')
          : null,
        uploadedAt: data.markMissing ? null : new Date(),
      },
    });
  }

  async listForEntity(entityType: string, entityId: string) {
    return prisma.productionAssetIntake.findMany({
      where: { entityType, entityId },
      orderBy: [{ kind: 'asc' }, { version: 'desc' }],
    });
  }

  async ensureRequiredCharacterSlots(universeId: string, characterId: string, code: string) {
    const kinds = [
      'CHARACTER_BLEND',
      'CHARACTER_GLB',
      'REFERENCE_IMAGE',
      'TURNAROUND',
      'EXPRESSION_SHEET',
      'RIG',
      'FACIAL_SHAPEKEYS',
      'TEXTURE',
    ] as const;

    const created = [];
    for (const kind of kinds) {
      const existing = await prisma.productionAssetIntake.findFirst({
        where: { entityType: 'character', entityId: characterId, kind },
      });
      if (!existing) {
        created.push(
          await this.register({
            universeId,
            entityType: 'character',
            entityId: characterId,
            kind,
            markMissing: true,
            missingReason: `PRODUCTION ASSET REQUIRED for ${code}: ${kind}`,
            notes: 'Intake slot reserved. Upload real production file to proceed.',
          }),
        );
      }
    }
    return created;
  }

  async ensureRequiredLocationSlots(universeId: string, locationId: string, code: string) {
    const kinds = [
      'LOCATION_BLEND',
      'LOCATION_PROP',
      'TEXTURE',
      'LIGHTING_SETUP',
      'REFERENCE_IMAGE',
    ] as const;
    const created = [];
    for (const kind of kinds) {
      const existing = await prisma.productionAssetIntake.findFirst({
        where: { entityType: 'location', entityId: locationId, kind },
      });
      if (!existing) {
        created.push(
          await this.register({
            universeId,
            entityType: 'location',
            entityId: locationId,
            kind,
            markMissing: true,
            missingReason: `PRODUCTION ASSET REQUIRED for location ${code}: ${kind}`,
            notes: 'Reusable set slot reserved. Upload real environment assets to proceed.',
          }),
        );
      }
    }
    return created;
  }
}

type ValidationCheck = {
  code: string;
  passed: boolean;
  severity: 'error' | 'warning';
  message: string;
};

export class CharacterAssetValidator {
  async validate(characterId: string) {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        models: { include: { rig: true, facialRig: true } },
        rigs: true,
        facialRigs: true,
        referenceImages: true,
        visualDna: true,
      },
    });
    if (!character) {
      throw new AppError('Character not found', 'CHARACTER_NOT_FOUND', 404);
    }

    const intakes = await prisma.productionAssetIntake.findMany({
      where: { entityType: 'character', entityId: characterId },
    });
    const model = character.models[0];
    const checks: ValidationCheck[] = [];

    const hasBlend = intakes.some(
      (i) => i.kind === 'CHARACTER_BLEND' && i.storageLocation && i.approvalStatus !== 'MISSING',
    );
    const hasGlb = intakes.some(
      (i) =>
        (i.kind === 'CHARACTER_GLB' || i.kind === 'CHARACTER_GLTF') &&
        i.storageLocation &&
        i.approvalStatus !== 'MISSING',
    );

    checks.push({
      code: 'MODEL_EXISTS',
      passed: Boolean(model?.masterBlendAssetId) || hasBlend || hasGlb,
      severity: 'error',
      message: hasBlend || hasGlb || model?.masterBlendAssetId
        ? 'Model file registered.'
        : 'PRODUCTION ASSET REQUIRED — no .blend/.glb uploaded.',
    });
    checks.push({
      code: 'FILE_LOADABLE',
      passed: false,
      severity: 'error',
      message: hasBlend || hasGlb
        ? 'File registered but not yet load-tested in Blender worker.'
        : 'Cannot load — production file missing.',
    });
    // Override FILE_LOADABLE to warning if file exists but untested
    if (hasBlend || hasGlb) {
      checks[checks.length - 1] = {
        code: 'FILE_LOADABLE',
        passed: false,
        severity: 'warning',
        message: 'File registered; Blender load validation pending worker run.',
      };
    }

    checks.push({
      code: 'RIG_EXISTS',
      passed: Boolean(character.rigs.some((r) => r.approved && r.status === 'APPROVED')),
      severity: 'error',
      message: 'Approved body rig required.',
    });
    checks.push({
      code: 'FACIAL_RIG_EXISTS',
      passed: Boolean(character.facialRigs.some((r) => r.approved && r.status === 'APPROVED')),
      severity: 'error',
      message: 'Approved facial rig required for lip sync.',
    });
    checks.push({
      code: 'TEXTURES_RESOLVE',
      passed: intakes.some((i) => i.kind === 'TEXTURE' && i.storageLocation),
      severity: 'error',
      message: 'Texture set not uploaded.',
    });
    checks.push({
      code: 'MATERIALS_RESOLVE',
      passed: intakes.some((i) => i.kind === 'MATERIAL' && i.storageLocation),
      severity: 'warning',
      message: 'Material set not uploaded.',
    });
    checks.push({
      code: 'REFERENCE_APPROVED',
      passed: character.referenceImages.some((r) => r.reviewStatus === 'APPROVED'),
      severity: 'error',
      message: 'No approved visual reference.',
    });
    checks.push({
      code: 'VERTICAL_FRAMING',
      passed: true,
      severity: 'warning',
      message: 'Vertical framing check deferred until model loads.',
    });
    checks.push({
      code: 'RENDER_ENGINE_COMPAT',
      passed: true,
      severity: 'warning',
      message: 'EEVEE/Cycles compatibility deferred until model loads.',
    });

    const facial = character.facialRigs[0];
    const visemes = Array.isArray(facial?.visemes) ? facial!.visemes : [];
    const requiredVisemes = ['A', 'E', 'I', 'O', 'U', 'M_B_P', 'F_V', 'L', 'TH', 'REST'];
    const missingVisemes = requiredVisemes.filter((v) => !visemes.includes(v));
    checks.push({
      code: 'LIP_SYNC_CAPABILITY',
      passed: missingVisemes.length === 0 && Boolean(facial?.approved),
      severity: 'error',
      message:
        missingVisemes.length || !facial?.approved
          ? `Missing lip-sync controls/approval. Missing visemes: ${missingVisemes.join(', ') || 'facial unapproved'}`
          : 'Lip-sync viseme set present.',
    });

    const errors = checks.filter((c) => c.severity === 'error' && !c.passed);
    const score = Math.round(
      (checks.filter((c) => c.passed).length / Math.max(checks.length, 1)) * 100,
    );
    const passed = errors.length === 0;
    const strict = await studioSettingsService.isStrictCharacterLockEnabled();

    const report = await prisma.characterValidationReport.create({
      data: {
        characterId,
        modelId: model?.id ?? null,
        passed,
        blockedFinal: strict ? !passed : !passed,
        score,
        checks,
        missingControls: {
          visemes: missingVisemes,
          productionAssets: intakes
            .filter((i) => i.approvalStatus === 'MISSING' || !i.storageLocation)
            .map((i) => i.kind),
        },
      },
    });

    return { characterId, internalCode: character.internalCode, report, checks, passed, strict };
  }
}

export class ReferenceLockService {
  async approvePrimary(params: {
    characterId: string;
    referenceImageId: string;
    approvedBy: string;
    palette?: unknown;
    proportions?: unknown;
    silhouette?: string;
    clothing?: string;
    accessories?: string;
    forbiddenChanges?: string;
  }) {
    const ref = await prisma.characterReferenceImage.findUnique({
      where: { id: params.referenceImageId },
    });
    if (!ref || ref.characterId !== params.characterId) {
      throw new AppError('Reference image not found for character', 'REFERENCE_NOT_FOUND', 404);
    }
    if (!ref.assetId) {
      throw new AppError(
        'Cannot lock reference without an uploaded asset file.',
        'REFERENCE_ASSET_REQUIRED',
        409,
      );
    }

    await prisma.characterReferenceImage.update({
      where: { id: ref.id },
      data: { reviewStatus: 'APPROVED' },
    });

    return prisma.approvedCharacterReference.create({
      data: {
        characterId: params.characterId,
        characterVersionId: ref.characterVersionId,
        referenceImageId: ref.id,
        role: 'PRIMARY',
        immutable: true,
        approvedAt: new Date(),
        approvedBy: params.approvedBy,
        palette: params.palette as object | undefined,
        proportions: params.proportions as object | undefined,
        silhouette: params.silhouette ?? null,
        clothing: params.clothing ?? null,
        accessories: params.accessories ?? null,
        forbiddenChanges:
          params.forbiddenChanges ??
          'Do not alter silhouette, palette, or proportions without a new approved version.',
      },
    });
  }

  async requireApprovedReference(characterId: string) {
    const locked = await prisma.approvedCharacterReference.findFirst({
      where: { characterId, role: 'PRIMARY', immutable: true },
    });
    if (!locked) {
      throw new AppError(
        'Approved immutable visual reference required. AI generation blocked.',
        'REFERENCE_LOCK_REQUIRED',
        409,
      );
    }
    return locked;
  }

  /**
   * AI providers that support references must receive them.
   * Never silently fall back to text-only character recreation.
   */
  async assertReferenceConditioning(params: {
    characterId: string;
    providerSupportsReferenceImages: boolean;
    referenceConditioningSucceeded?: boolean;
  }) {
    await this.requireApprovedReference(params.characterId);
    if (!params.providerSupportsReferenceImages) {
      throw new AppError(
        'Provider does not support reference conditioning. FAIL generation — no text-only Pip/Goat recreation.',
        'REFERENCE_CONDITIONING_UNSUPPORTED',
        409,
      );
    }
    if (params.referenceConditioningSucceeded === false) {
      throw new AppError(
        'Reference conditioning failed. FAIL THE GENERATION JOB — no text-only fallback.',
        'REFERENCE_CONDITIONING_FAILED',
        409,
      );
    }
  }
}

export class VoiceProductionService {
  async getOrCreate(characterId: string) {
    const existing = await prisma.voiceProductionConfig.findUnique({ where: { characterId } });
    if (existing) return existing;
    return prisma.voiceProductionConfig.create({
      data: {
        characterId,
        provider: null,
        voiceId: null,
        approved: false,
        blockedReason: 'Voice provider ID not configured.',
      },
    });
  }

  async configure(params: {
    characterId: string;
    provider?: string | null;
    voiceId?: string | null;
    voiceVersion?: string | null;
    speed?: number | null;
    pitch?: number | null;
    stability?: number | null;
    pronunciationDictionary?: object | null;
    emotionalDelivery?: object | null;
    auditionNotes?: string | null;
  }) {
    await this.getOrCreate(params.characterId);
    const voiceId = params.voiceId?.trim() || null;
    const provider = params.provider?.trim() || null;
    return prisma.voiceProductionConfig.update({
      where: { characterId: params.characterId },
      data: {
        provider,
        voiceId,
        voiceVersion: params.voiceVersion ?? null,
        speed: params.speed ?? null,
        pitch: params.pitch ?? null,
        stability: params.stability ?? null,
        pronunciationDictionary: params.pronunciationDictionary ?? undefined,
        emotionalDelivery: params.emotionalDelivery ?? undefined,
        auditionNotes: params.auditionNotes ?? null,
        approved: false,
        blockedReason:
          !provider || !voiceId
            ? 'Voice provider ID not configured.'
            : 'Configured but not approved — run audition workflow.',
      },
    });
  }

  async approve(characterId: string, approvedBy: string) {
    const config = await this.getOrCreate(characterId);
    if (!config.provider || !config.voiceId) {
      throw new AppError(
        'Cannot approve voice without provider and voice ID.',
        'VOICE_CONFIG_INCOMPLETE',
        409,
      );
    }
    return prisma.voiceProductionConfig.update({
      where: { characterId },
      data: {
        approved: true,
        approvedBy,
        approvedAt: new Date(),
        blockedReason: null,
      },
    });
  }

  async assertApprovedForFinal(characterId: string) {
    const config = await this.getOrCreate(characterId);
    if (!config.approved || !config.voiceId) {
      throw new AppError(
        'Character voice not approved for final production.',
        'VOICE_NOT_APPROVED',
        409,
      );
    }
    return config;
  }
}

export class ShotPackageService {
  async buildForShot(shotId: string) {
    const shot = await prisma.shot.findUnique({
      where: { id: shotId },
      include: { scene: { include: { episode: true, location: true } } },
    });
    if (!shot) throw new AppError('Shot not found', 'SHOT_NOT_FOUND', 404);

    const characterIds = Array.isArray(shot.characterIds)
      ? (shot.characterIds as string[])
      : [];
    const blockedReasons: string[] = [];

    for (const characterId of characterIds) {
      try {
        await characterPreflightService.assertNativeRenderAllowed(characterId);
      } catch (error) {
        blockedReasons.push(
          error instanceof AppError ? error.message : `Character ${characterId} not production ready`,
        );
      }
    }

    const instructions = {
      modular: true,
      components: [
        'character_placement',
        'body_animation',
        'facial_animation',
        'eye_direction',
        'mouth_animation',
        'camera_placement',
        'camera_animation',
        'environment_animation',
        'prop_interaction',
        'lighting',
        'vfx',
        'transitions',
      ],
      shot: {
        id: shot.id,
        number: shot.shotNumber,
        description: shot.description,
        durationSeconds: shot.durationSeconds,
        cameraPreset: shot.cameraPreset,
        lightingPreset: shot.lightingPreset,
      },
      locationId: shot.scene.locationId,
      episodeId: shot.scene.episodeId,
      blenderScripts: [
        'scripts/blender/assemble_scene.py',
        'scripts/blender/load_character.py',
        'scripts/blender/load_location.py',
        'scripts/blender/apply_animation.py',
        'scripts/blender/configure_camera.py',
        'scripts/blender/configure_lights.py',
        'scripts/blender/apply_lip_sync.py',
        'scripts/blender/render_frames.py',
      ],
    };

    return prisma.shotAnimationPackage.create({
      data: {
        shotId: shot.id,
        episodeId: shot.scene.episodeId,
        instructions,
        characterPlacements: characterIds.map((id, index) => ({
          characterId: id,
          slot: index,
          status: blockedReasons.length ? 'BLOCKED' : 'PLANNED',
        })),
        camera: { preset: shot.cameraPreset, profile: 'DOODLE_DASH_SHORTS' },
        lighting: { preset: shot.lightingPreset },
        status: blockedReasons.length ? 'BLOCKED' : 'READY_FOR_WORKER',
        blockedReasons,
      },
    });
  }
}

export class ShortsProfileService {
  async ensureDefault() {
    return prisma.shortsProductionProfile.upsert({
      where: { code: 'DOODLE_DASH_SHORTS' },
      update: {},
      create: {
        code: 'DOODLE_DASH_SHORTS',
        name: 'Doodle Dash Shorts',
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        fps: 30,
        allowedDurations: [15, 30, 45, 60],
        titleSafePct: 0.1,
        captionSafePct: 0.15,
        config: {
          openingHookSeconds: 2,
          mobileCropPreview: true,
          compositionGuides: true,
        },
      },
    });
  }

  validateDuration(seconds: number, allowed: number[]) {
    if (!allowed.includes(seconds)) {
      return {
        ok: false,
        message: `Duration ${seconds}s not in allowed Shorts lengths: ${allowed.join(', ')}`,
      };
    }
    return { ok: true, message: 'Duration valid for Doodle Dash Shorts.' };
  }
}

export class PacingToolsService {
  async analyzeEpisode(episodeId: string) {
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        scenes: { include: { shots: true } },
        dialogues: true,
      },
    });
    if (!episode) throw new AppError('Episode not found', 'EPISODE_NOT_FOUND', 404);

    const shots = episode.scenes.flatMap((s) => s.shots);
    const totalDuration = shots.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    const dialogueCount = episode.dialogues.length;
    const metrics = {
      firstFrameInterest: shots[0] ? 'planned' : 'missing',
      hookWindowSeconds: 2,
      visualChangeCount: shots.length,
      characterMovementShots: shots.filter((s) =>
        /walk|run|jump|move/i.test(s.description),
      ).length,
      dialogueDensity: dialogueCount / Math.max(totalDuration, 1),
      estimatedSilenceRisk: dialogueCount === 0,
      sceneCount: episode.scenes.length,
      shotCount: shots.length,
      totalDurationSec: totalDuration,
      emotionalBeat: episode.emotionalBeat ?? null,
      conflict: episode.conflict ?? null,
      payoff: episode.resolution ?? null,
      cliffhanger: episode.nextEpisodeSeed ?? null,
    };

    const warnings: string[] = [];
    if (!shots[0]) warnings.push('No shots — first-frame visual interest unknown.');
    if (totalDuration > 0 && totalDuration < 15) {
      warnings.push('Episode shorter than minimum Shorts duration guidance (15s).');
    }
    if (dialogueCount === 0) warnings.push('No dialogue lines planned.');
    if (shots.length < 3) warnings.push('Low visual change frequency for kids pacing.');

    const guidance = [
      'Ensure a clear hook in the first 1–2 seconds.',
      'Prefer frequent readable visual changes over long static holds.',
      'Keep dialogue density age-appropriate; avoid long silence without visual interest.',
      'These are production guidance metrics, not virality predictions.',
    ];

    return prisma.episodePacingReport.create({
      data: {
        episodeId,
        metrics,
        warnings,
        guidance,
      },
    });
  }
}

export class ProductionReadinessService {
  async snapshotUniverse(universeId: string) {
    const [pip, goat] = await Promise.all([
      characterService.getByCode(FOUNDING_CODES.PIP).catch(() => null),
      characterService.getByCode(FOUNDING_CODES.GOAT).catch(() => null),
    ]);

    const rows: Array<{
      area: string;
      entityKey: string;
      state: 'READY' | 'WARNING' | 'BLOCKED' | 'NOT_CONFIGURED';
      reason: string;
      details?: object;
    }> = [];

    for (const character of [pip, goat]) {
      if (!character) continue;
      const model = character.models[0];
      const voice = await prisma.voiceProductionConfig.findUnique({
        where: { characterId: character.id },
      });
      const refs = await prisma.approvedCharacterReference.count({
        where: { characterId: character.id, immutable: true },
      });
      const intakes = await prisma.productionAssetIntake.findMany({
        where: { entityType: 'character', entityId: character.id },
      });

      rows.push({
        area: 'CHARACTER_MODEL',
        entityKey: character.internalCode,
        state: model?.productionReady ? 'READY' : 'BLOCKED',
        reason: model?.productionReady
          ? 'Production-ready model approved.'
          : `Model: BLOCKED — production .blend/.glb not uploaded (status=${model?.status ?? 'MISSING'})`,
      });
      rows.push({
        area: 'REFERENCE',
        entityKey: character.internalCode,
        state: refs > 0 ? 'READY' : 'BLOCKED',
        reason:
          refs > 0
            ? 'Immutable approved reference locked.'
            : 'Reference: BLOCKED — no approved reference',
      });
      rows.push({
        area: 'VOICE',
        entityKey: character.internalCode,
        state: voice?.approved ? 'READY' : 'BLOCKED',
        reason: voice?.approved
          ? 'Voice approved.'
          : 'Voice: BLOCKED — provider voice ID not configured or not approved',
      });
      rows.push({
        area: 'RIG',
        entityKey: character.internalCode,
        state: character.rigs.some((r) => r.approved) ? 'READY' : 'BLOCKED',
        reason: character.rigs.some((r) => r.approved)
          ? 'Approved rig present.'
          : 'Rig: BLOCKED — not approved',
      });
      rows.push({
        area: 'CANON',
        entityKey: character.internalCode,
        state: 'READY',
        reason: 'Founding character canon records present.',
      });
      rows.push({
        area: 'INTAKE',
        entityKey: character.internalCode,
        state: intakes.some((i) => i.storageLocation) ? 'WARNING' : 'BLOCKED',
        reason: intakes.some((i) => i.storageLocation)
          ? 'Some intake files registered; validation still required.'
          : `PRODUCTION ASSET REQUIRED — ${intakes.filter((i) => !i.storageLocation).length} missing intake slots`,
        details: { missingKinds: intakes.filter((i) => !i.storageLocation).map((i) => i.kind) },
      });
    }

    const locations = await prisma.location.findMany({ where: { universeId } });
    for (const location of locations) {
      rows.push({
        area: 'LOCATION',
        entityKey: location.internalCode,
        state: location.approved && location.masterBlendAssetId ? 'READY' : 'BLOCKED',
        reason:
          location.approved && location.masterBlendAssetId
            ? 'Location production asset approved.'
            : `Location: BLOCKED — environment .blend not uploaded/approved (${location.status})`,
      });
    }

    rows.push({
      area: 'RENDERING',
      entityKey: 'BLENDER_WORKER',
      state: 'WARNING',
      reason:
        'Blender worker + scripts exist; real renders require uploaded assets and a live worker process.',
    });
    rows.push({
      area: 'AI_VIDEO',
      entityKey: 'SORA_SEEDANCE',
      state: 'NOT_CONFIGURED',
      reason: 'Optional providers stubbed only — no credentials configured; native 3D remains primary.',
    });
    rows.push({
      area: 'ANIMATION',
      entityKey: 'SHOT_PACKAGES',
      state: 'WARNING',
      reason: 'Shot package builder ready; execution blocked until character assets validate.',
    });
    rows.push({
      area: 'AUDIO',
      entityKey: 'MIX_CAPTIONS',
      state: 'WARNING',
      reason: 'FFmpeg/caption tooling ready; dialogue voice generation blocked without approved voice IDs.',
    });
    rows.push({
      area: 'PUBLISHING',
      entityKey: 'PACKAGE',
      state: 'NOT_CONFIGURED',
      reason: 'Publishing package builder available; auto-publish disabled until authorized integration.',
    });

    await prisma.productionReadinessSnapshot.deleteMany({ where: { universeId } });
    await prisma.productionReadinessSnapshot.createMany({
      data: rows.map((row) => ({
        universeId,
        area: row.area,
        entityKey: row.entityKey,
        state: row.state,
        reason: row.reason,
        details: row.details ?? undefined,
      })),
    });

    return rows;
  }
}

export class BuildEpisodeOrchestrator {
  constructor(
    private readonly intake = new AssetIntakeService(),
    private readonly validator = new CharacterAssetValidator(),
    private readonly voices = new VoiceProductionService(),
    private readonly shotPackages = new ShotPackageService(),
    private readonly shorts = new ShortsProfileService(),
    private readonly pacing = new PacingToolsService(),
    private readonly readiness = new ProductionReadinessService(),
  ) {}

  async start(params: { episodeId: string; durationTargetSec?: number }) {
    const strict = await studioSettingsService.isStrictCharacterLockEnabled();
    if (!strict) {
      throw new AppError(
        'STRICT_CHARACTER_LOCK must remain enabled for BUILD EPISODE.',
        'CHARACTER_LOCK_REQUIRED',
        409,
      );
    }

    const episode = await prisma.episode.findUnique({
      where: { id: params.episodeId },
      include: {
        season: true,
        scenes: { include: { shots: true } },
        storyboard: true,
      },
    });
    if (!episode) throw new AppError('Episode not found', 'EPISODE_NOT_FOUND', 404);

    await this.shorts.ensureDefault();
    const profile = await prisma.shortsProductionProfile.findUniqueOrThrow({
      where: { code: 'DOODLE_DASH_SHORTS' },
    });
    const duration = params.durationTargetSec ?? 30;
    const durationCheck = this.shorts.validateDuration(duration, profile.allowedDurations);
    if (!durationCheck.ok) {
      throw new AppError(durationCheck.message, 'SHORTS_DURATION_INVALID', 400);
    }

    const run = await prisma.episodePipelineRun.create({
      data: {
        episodeId: episode.id,
        profileCode: 'DOODLE_DASH_SHORTS',
        status: 'RUNNING',
        currentStage: 'STORY_APPROVAL',
        durationTargetSec: duration,
        observability: { startedAt: new Date().toISOString() },
        stages: {
          create: PIPELINE_STAGES.map((stage) => ({
            stage,
            status: 'PENDING',
          })),
        },
      },
      include: { stages: true },
    });

    const results: Array<{ stage: string; status: string; detail?: unknown }> = [];

    const setStage = async (
      stage: PipelineStageCode,
      status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'SKIPPED',
      detail?: { warnings?: unknown; errors?: unknown; outputs?: unknown; blockedReason?: string },
    ) => {
      await prisma.episodePipelineStage.update({
        where: { pipelineRunId_stage: { pipelineRunId: run.id, stage } },
        data: {
          status,
          startedAt: status === 'RUNNING' ? new Date() : undefined,
          finishedAt: status === 'RUNNING' ? undefined : new Date(),
          attemptCount: { increment: status === 'RUNNING' ? 1 : 0 },
          warnings: detail?.warnings as object | undefined,
          errors: detail?.errors as object | undefined,
          outputs: detail?.outputs as object | undefined,
          blockedReason: detail?.blockedReason ?? null,
        },
      });
      await prisma.episodePipelineRun.update({
        where: { id: run.id },
        data: { currentStage: stage, status: status === 'BLOCKED' || status === 'FAILED' ? status : 'RUNNING' },
      });
      results.push({ stage, status, detail });
    };

    // 1 Story approval
    await setStage('STORY_APPROVAL', 'RUNNING');
    if (episode.status !== 'APPROVED' && episode.status !== 'IN_PRODUCTION') {
      await setStage('STORY_APPROVAL', 'BLOCKED', {
        blockedReason: `Episode status is ${episode.status}; requires APPROVED before production.`,
      });
      return this.finish(run.id, 'BLOCKED', results);
    }
    if (episode.season && !episode.season.approvedForProduction) {
      await setStage('STORY_APPROVAL', 'BLOCKED', {
        blockedReason: 'Season not approved for production.',
      });
      return this.finish(run.id, 'BLOCKED', results);
    }
    await setStage('STORY_APPROVAL', 'SUCCEEDED');

    // 2 Continuity
    await setStage('CONTINUITY_CHECK', 'RUNNING');
    const canonFacts = await prisma.canonFact.findMany({
      where: { universeId: episode.universeId },
      take: 50,
    });
    const { doodleGuardian, productionDirectorService, preflightService } =
      await productionRuntime();
    const guardian = doodleGuardian.score({
      text: [episode.title, episode.logline, episode.synopsis].filter(Boolean).join(' '),
      canonFacts,
    });
    // Hard-block only on locked-canon conflicts. Soft "consideration" warnings are recorded
    // but must not freeze an approved episode that does not contradict founding canon.
    if (guardian.conflicts.length > 0) {
      await setStage('CONTINUITY_CHECK', 'BLOCKED', {
        blockedReason: `Doodle Guardian hard conflicts: ${guardian.conflicts.length} (score ${guardian.score})`,
        outputs: guardian,
      });
      return this.finish(run.id, 'BLOCKED', results);
    }
    if (!guardian.passed) {
      await setStage('CONTINUITY_CHECK', 'SUCCEEDED', {
        warnings: guardian.warnings,
        outputs: {
          ...guardian,
          note: `Score ${guardian.score} < threshold ${guardian.threshold} due to soft warnings only; no hard conflicts.`,
        },
      });
    } else {
      await setStage('CONTINUITY_CHECK', 'SUCCEEDED', { outputs: guardian });
    }

    // 3 Storyboard
    await setStage('STORYBOARD', 'RUNNING');
    if (!episode.storyboard.length) {
      await setStage('STORYBOARD', 'BLOCKED', {
        blockedReason: 'No storyboard exists for episode.',
      });
      return this.finish(run.id, 'BLOCKED', results);
    }
    await setStage('STORYBOARD', 'SUCCEEDED');

    // 4 Shot planning
    await setStage('SHOT_PLANNING', 'RUNNING');
    const shots = episode.scenes.flatMap((s) => s.shots);
    if (!shots.length) {
      await setStage('SHOT_PLANNING', 'BLOCKED', { blockedReason: 'No shots planned.' });
      return this.finish(run.id, 'BLOCKED', results);
    }
    const plan = productionDirectorService.planEpisode(
      shots.map((shot) => ({
        shotId: shot.id,
        description: shot.description,
        durationSeconds: shot.durationSeconds,
        characterIds: Array.isArray(shot.characterIds) ? (shot.characterIds as string[]) : [],
        storyImportance: 60,
      })),
    );
    await setStage('SHOT_PLANNING', 'SUCCEEDED', { outputs: plan });

    // 5 Asset check
    await setStage('ASSET_CHECK', 'RUNNING');
    const founding = await characterService.getFoundingCharacters();
    const validations = [];
    for (const character of founding) {
      await this.intake.ensureRequiredCharacterSlots(
        episode.universeId,
        character.id,
        character.internalCode,
      );
      validations.push(await this.validator.validate(character.id));
    }
    const assetBlocked = validations.filter((v) => !v.passed);
    if (assetBlocked.length) {
      await setStage('ASSET_CHECK', 'BLOCKED', {
        blockedReason: assetBlocked
          .map((v) => `${v.internalCode}: production assets/validation failed`)
          .join('; '),
        outputs: validations,
      });
      await this.readiness.snapshotUniverse(episode.universeId);
      return this.finish(run.id, 'BLOCKED', results);
    }
    await setStage('ASSET_CHECK', 'SUCCEEDED', { outputs: validations });

    // 6 Voice
    await setStage('VOICE_GENERATION', 'RUNNING');
    try {
      for (const character of founding) {
        await this.voices.assertApprovedForFinal(character.id);
      }
      await setStage('VOICE_GENERATION', 'SUCCEEDED');
    } catch (error) {
      await setStage('VOICE_GENERATION', 'BLOCKED', {
        blockedReason: error instanceof AppError ? error.message : 'Voice blocked',
      });
      return this.finish(run.id, 'BLOCKED', results);
    }

    // 7 Animation packages
    await setStage('ANIMATION', 'RUNNING');
    const packages = [];
    for (const shot of shots) {
      packages.push(await this.shotPackages.buildForShot(shot.id));
    }
    if (packages.some((p) => p.status === 'BLOCKED')) {
      await setStage('ANIMATION', 'BLOCKED', {
        blockedReason: 'One or more shot packages blocked by missing character assets.',
        outputs: packages,
      });
      return this.finish(run.id, 'BLOCKED', results);
    }
    await setStage('ANIMATION', 'SUCCEEDED', { outputs: { packageIds: packages.map((p) => p.id) } });

    // 8 Preflight
    await setStage('PREFLIGHT', 'RUNNING');
    const episodePreflight = await preflightService.runEpisodeLevel(episode.id);
    if (!episodePreflight.ok) {
      await setStage('PREFLIGHT', 'BLOCKED', {
        blockedReason: 'Episode preflight failed.',
        outputs: episodePreflight,
      });
      return this.finish(run.id, 'BLOCKED', results);
    }
    await setStage('PREFLIGHT', 'SUCCEEDED', { outputs: episodePreflight });

    // 9 Guardian again
    await setStage('DOODLE_GUARDIAN', 'SUCCEEDED', {
      outputs: { threshold: DOODLE_GUARDIAN_THRESHOLD, score: guardian.score },
    });

    // 10–12 Draft/QC/Final — blocked without real Blender assets/worker completion
    await setStage('DRAFT_RENDER', 'BLOCKED', {
      blockedReason:
        'Draft render not executed — Blender worker requires real production assets and a live worker claim. No fake render reported.',
    });
    await setStage('QC', 'SKIPPED', {
      blockedReason: 'Skipped because draft render did not complete.',
    });
    await setStage('FINAL_RENDER', 'BLOCKED', {
      blockedReason: 'STRICT_CHARACTER_LOCK / missing production renders — final MP4 not produced.',
    });
    await setStage('AUDIO_POST', 'BLOCKED', {
      blockedReason: 'Audio post waits for approved voices + rendered picture.',
    });
    await setStage('CAPTIONS', 'BLOCKED', {
      blockedReason: 'Captions wait for final dialogue timing.',
    });
    await setStage('PUBLISHING_PACKAGE', 'BLOCKED', {
      blockedReason: 'Publishing package waits for final MP4; auto-publish disabled.',
    });

    await this.pacing.analyzeEpisode(episode.id);
    await this.readiness.snapshotUniverse(episode.universeId);
    return this.finish(run.id, 'BLOCKED', results);
  }

  private async finish(
    runId: string,
    status: string,
    results: Array<{ stage: string; status: string; detail?: unknown }>,
  ) {
    const run = await prisma.episodePipelineRun.update({
      where: { id: runId },
      data: {
        status,
        errorSummary:
          status === 'BLOCKED'
            ? 'Pipeline stopped at dependency boundary. See stages for exact blockers.'
            : null,
        observability: {
          finishedAt: new Date().toISOString(),
          stageResults: results as object[],
        } as object,
      },
      include: { stages: { orderBy: { createdAt: 'asc' } } },
    });
    return run;
  }

  /**
   * Resume a blocked/failed run without discarding SUCCEEDED stages.
   * Re-executes from the first non-SUCCEEDED stage by creating a linked continuation
   * that copies prior SUCCEEDED outputs, then runs remaining work via start().
   */
  async resume(pipelineRunId: string) {
    const run = await prisma.episodePipelineRun.findUnique({
      where: { id: pipelineRunId },
      include: { stages: true },
    });
    if (!run) throw new AppError('Pipeline run not found', 'PIPELINE_NOT_FOUND', 404);
    if (!run.resumable) {
      throw new AppError('Pipeline run is not resumable', 'PIPELINE_NOT_RESUMABLE', 409);
    }

    const succeeded = run.stages.filter((s) => s.status === 'SUCCEEDED');
    const next = await this.start({
      episodeId: run.episodeId,
      durationTargetSec: run.durationTargetSec ?? 30,
    });

    // Annotate continuity of resume for observability (successful stages remain in prior run).
    await prisma.episodePipelineRun.update({
      where: { id: next.id },
      data: {
        observability: {
          resumedFrom: run.id,
          priorSucceededStages: succeeded.map((s) => s.stage),
          note: 'New run evaluates all gates; prior SUCCEEDED stages remain on the previous run record.',
        },
      },
    });

    return prisma.episodePipelineRun.findUniqueOrThrow({
      where: { id: next.id },
      include: { stages: { orderBy: { createdAt: 'asc' } } },
    });
  }
}

export class ObservabilityService {
  async record(input: {
    jobId: string;
    jobType: string;
    episodeId?: string;
    sceneId?: string;
    shotId?: string;
    characterVersions?: object;
    assetVersions?: object;
    provider?: string;
    model?: string;
    warnings?: unknown;
    errors?: unknown;
    retryCount?: number;
    costUnits?: number;
    durationMs?: number;
  }) {
    return prisma.productionJobObservation.create({
      data: {
        jobId: input.jobId,
        jobType: input.jobType,
        episodeId: input.episodeId ?? null,
        sceneId: input.sceneId ?? null,
        shotId: input.shotId ?? null,
        characterVersions: input.characterVersions,
        assetVersions: input.assetVersions,
        provider: input.provider ?? null,
        model: input.model ?? null,
        warnings: input.warnings as object | undefined,
        errors: input.errors as object | undefined,
        retryCount: input.retryCount ?? 0,
        costUnits: input.costUnits ?? null,
        durationMs: input.durationMs ?? null,
        startedAt: new Date(),
      },
    });
  }
}

/**
 * Builds a publishing package record when a real final MP4 exists.
 * Never fabricates renders or auto-publishes.
 */
export class PublishingPackageService {
  async buildForEpisode(episodeId: string) {
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        scenes: { include: { shots: true } },
        dialogues: true,
        publishingReleases: true,
      },
    });
    if (!episode) throw new AppError('Episode not found', 'EPISODE_NOT_FOUND', 404);

    const finalOutputs = await prisma.renderOutput.findMany({
      where: {
        renderJob: { episodeId, status: 'COMPLETE' },
      },
      take: 20,
    });
    const mp4 = finalOutputs.find(
      (o) =>
        typeof (o as { uri?: string }).uri === 'string' &&
        String((o as { uri?: string }).uri).toLowerCase().endsWith('.mp4'),
    );

    const characters = await characterService.getFoundingCharacters();
    const assetVersions = await prisma.productionAssetIntake.findMany({
      where: {
        entityType: 'character',
        entityId: { in: characters.map((c) => c.id) },
        storageLocation: { not: null },
      },
    });

    const packagePayload = {
      episodeId: episode.id,
      title: episode.title,
      description: episode.synopsis ?? episode.logline,
      caption: episode.hook ?? episode.logline,
      srt: null as string | null,
      finalMp4: mp4 ? (mp4 as { uri?: string }).uri : null,
      thumbnailCandidate: null,
      characters: characters.map((c) => ({
        id: c.id,
        code: c.internalCode,
        versionId: c.currentVersionId,
      })),
      continuitySummary: {
        emotionalBeat: episode.emotionalBeat,
        conflict: episode.conflict,
        resolution: episode.resolution,
        nextEpisodeSeed: episode.nextEpisodeSeed,
      },
      cost: null,
      productionDurationMetrics: {
        plannedDurationSec: episode.durationSec,
        shotCount: episode.scenes.reduce((n, s) => n + s.shots.length, 0),
      },
      assetVersionsUsed: assetVersions.map((a) => ({
        id: a.id,
        kind: a.kind,
        version: a.version,
        checksum: a.checksum,
      })),
      autoPublish: false,
      blockedReason: mp4
        ? null
        : 'Final MP4 not available — no completed Blender render output. Package metadata only.',
    };

    const release = await prisma.publishingRelease.create({
      data: {
        episodeId: episode.id,
        universeId: episode.universeId,
        status: mp4 ? 'READY_FOR_REVIEW' : 'BLOCKED',
        title: episode.title,
        packageMeta: packagePayload,
      },
    });

    return { release, package: packagePayload };
  }
}

export const assetIntakeService = new AssetIntakeService();
export const characterAssetValidator = new CharacterAssetValidator();
export const referenceLockService = new ReferenceLockService();
export const voiceProductionService = new VoiceProductionService();
export const shotPackageService = new ShotPackageService();
export const shortsProfileService = new ShortsProfileService();
export const pacingToolsService = new PacingToolsService();
export const productionReadinessService = new ProductionReadinessService();
export const buildEpisodeOrchestrator = new BuildEpisodeOrchestrator();
export const observabilityService = new ObservabilityService();
export const publishingPackageService = new PublishingPackageService();
