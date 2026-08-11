import { createHash } from 'crypto';
import { prisma } from '@doodle-dash/database';
import {
  DEFAULT_AI_VIDEO_ENABLED,
  DEFAULT_DRAFT_RENDER_PROFILE,
  DEFAULT_FINAL_ENGINE,
  DEFAULT_FINAL_FPS,
  DEFAULT_FINAL_RENDER_PROFILE,
  DEFAULT_FINAL_RESOLUTION,
  PROCEDURAL_CAMERA_CODES,
  PRODUCT_DISPLAY_NAME,
  SEMANTIC_ANIMATION_CODES,
  type ProductionRenderProfileCode,
} from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';
import { studioSettingsService } from '@doodle-dash/characters';
import { detectBlenderBinary } from './launch-prep';
import { referenceLockService } from './readiness';

export const EEVEE_QUALITY_PRESETS = {
  DRAFT_FAST: {
    samples: 16,
    shadows: 'low',
    ambientOcclusion: false,
    bloom: false,
    motionBlur: false,
    antiAliasing: 'FXAA',
    volumetrics: 'off',
    reflectionQuality: 'low',
    textureQuality: 'medium',
    lightingQuality: 'medium',
    transparency: 'fast',
    colorManagement: 'Filmic',
  },
  DRAFT_HD: {
    samples: 32,
    shadows: 'medium',
    ambientOcclusion: true,
    bloom: true,
    motionBlur: false,
    antiAliasing: 'FXAA',
    volumetrics: 'low',
    reflectionQuality: 'medium',
    textureQuality: 'high',
    lightingQuality: 'high',
    transparency: 'balanced',
    colorManagement: 'Filmic',
  },
  FINAL_1080P: {
    samples: 64,
    shadows: 'high',
    ambientOcclusion: true,
    bloom: true,
    motionBlur: false,
    antiAliasing: 'TAA',
    volumetrics: 'medium',
    reflectionQuality: 'high',
    textureQuality: 'high',
    lightingQuality: 'high',
    transparency: 'quality',
    hairFur: 'supported_when_present',
    colorManagement: 'Filmic',
    look: 'clean colorful professional kids animation',
  },
  PREMIUM: {
    engine: 'CYCLES',
    samples: 128,
    shadows: 'high',
    ambientOcclusion: true,
    bloom: true,
    motionBlur: true,
    antiAliasing: 'native',
    volumetrics: 'high',
    reflectionQuality: 'high',
    textureQuality: 'high',
    lightingQuality: 'high',
    transparency: 'quality',
    colorManagement: 'Filmic',
  },
} as const;

export type ProductionSettings = {
  defaultFinalResolution: string;
  defaultFinalWidth: number;
  defaultFinalHeight: number;
  defaultFps: number;
  defaultDraftProfile: string;
  defaultFinalProfile: string;
  defaultFinalEngine: string;
  cyclesAvailable: boolean;
  preferLocalBlender: boolean;
  remoteWorkerEnabled: boolean;
  cloudRenderEnabled: boolean;
  aiVideoEnabled: boolean;
  paidGenerationApprovalThresholdUsd: number;
  cacheBehavior: string;
  renderReuse: boolean;
  renderCacheEnabled: boolean;
  voiceCaching: boolean;
  voiceCacheEnabled: boolean;
  animationReuseEnabled: boolean;
  animationReuseAggressiveness: 'LOW' | 'MEDIUM' | 'HIGH' | 'OFF';
  qualityTarget: 'BEST_QUALITY_PER_DOLLAR' | 'MAXIMUM_QUALITY' | 'MINIMUM_COST';
  localComputeUsdPerMinute: number;
  productName: string;
};

export const DEFAULT_PRODUCTION_SETTINGS: ProductionSettings = {
  defaultFinalResolution: DEFAULT_FINAL_RESOLUTION,
  defaultFinalWidth: 1080,
  defaultFinalHeight: 1920,
  defaultFps: DEFAULT_FINAL_FPS,
  defaultDraftProfile: DEFAULT_DRAFT_RENDER_PROFILE,
  defaultFinalProfile: DEFAULT_FINAL_RENDER_PROFILE,
  defaultFinalEngine: DEFAULT_FINAL_ENGINE,
  cyclesAvailable: true,
  preferLocalBlender: true,
  remoteWorkerEnabled: false,
  cloudRenderEnabled: false,
  aiVideoEnabled: DEFAULT_AI_VIDEO_ENABLED,
  paidGenerationApprovalThresholdUsd: 1,
  cacheBehavior: 'ON',
  renderReuse: true,
  renderCacheEnabled: true,
  voiceCaching: true,
  voiceCacheEnabled: true,
  animationReuseEnabled: true,
  animationReuseAggressiveness: 'MEDIUM',
  qualityTarget: 'BEST_QUALITY_PER_DOLLAR',
  localComputeUsdPerMinute: 0.05,
  productName: PRODUCT_DISPLAY_NAME,
};

function fingerprint(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export class ProductionSettingsService {
  async ensureDefaults(): Promise<ProductionSettings> {
    const existing = await studioSettingsService.getJson(
      'PRODUCTION_SETTINGS',
      null as ProductionSettings | null,
    );
    if (!existing) {
      await studioSettingsService.setJson('PRODUCTION_SETTINGS', DEFAULT_PRODUCTION_SETTINGS);
      return { ...DEFAULT_PRODUCTION_SETTINGS };
    }
    return { ...DEFAULT_PRODUCTION_SETTINGS, ...existing };
  }

  async get() {
    return this.ensureDefaults();
  }

  async update(partial: Partial<ProductionSettings>) {
    const current = await this.ensureDefaults();
    const next = { ...current, ...partial };
    await studioSettingsService.setJson('PRODUCTION_SETTINGS', next);
    return next;
  }
}

export class ProductionProfileService {
  async seedProfiles() {
    const specs: Array<{
      code: ProductionRenderProfileCode;
      name: string;
      width: number;
      height: number;
      engine: string;
      purpose: string;
      isDefaultFinal?: boolean;
      isDefaultDraft?: boolean;
    }> = [
      {
        code: 'DRAFT_FAST',
        name: 'Draft Fast',
        width: 540,
        height: 960,
        engine: 'EEVEE',
        purpose: 'story timing, animation/camera/lip-sync/continuity review',
        isDefaultDraft: true,
      },
      {
        code: 'DRAFT_HD',
        name: 'Draft HD',
        width: 720,
        height: 1280,
        engine: 'EEVEE',
        purpose: 'high-confidence draft approval',
      },
      {
        code: 'FINAL_1080P',
        name: 'Final 1080p',
        width: 1080,
        height: 1920,
        engine: 'EEVEE',
        purpose: 'YouTube Shorts publishing default',
        isDefaultFinal: true,
      },
      {
        code: 'PREMIUM',
        name: 'Premium Cycles',
        width: 1080,
        height: 1920,
        engine: 'CYCLES',
        purpose: 'explicitly selected shots needing higher fidelity',
      },
    ];

    for (const spec of specs) {
      await prisma.productionRenderProfile.upsert({
        where: { code: spec.code },
        update: {
          name: spec.name,
          width: spec.width,
          height: spec.height,
          engine: spec.engine,
          purpose: spec.purpose,
          qualityPreset: EEVEE_QUALITY_PRESETS[spec.code],
          isDefaultFinal: Boolean(spec.isDefaultFinal),
          isDefaultDraft: Boolean(spec.isDefaultDraft),
          fps: 30,
          aspectRatio: '9:16',
        },
        create: {
          code: spec.code,
          name: spec.name,
          width: spec.width,
          height: spec.height,
          engine: spec.engine,
          purpose: spec.purpose,
          qualityPreset: EEVEE_QUALITY_PRESETS[spec.code],
          isDefaultFinal: Boolean(spec.isDefaultFinal),
          isDefaultDraft: Boolean(spec.isDefaultDraft),
          fps: 30,
          aspectRatio: '9:16',
        },
      });
    }

    // Keep legacy Shorts profile aligned with FINAL 1080P defaults.
    await prisma.shortsProductionProfile.upsert({
      where: { code: 'DOODLE_DASH_SHORTS' },
      update: {
        width: 1080,
        height: 1920,
        fps: 30,
        aspectRatio: '9:16',
        config: {
          defaultFinalProfile: 'FINAL_1080P',
          defaultDraftProfile: 'DRAFT_FAST',
          defaultEngine: 'EEVEE',
          blenderFirst: true,
          aiVideoDefault: false,
        },
      },
      create: {
        code: 'DOODLE_DASH_SHORTS',
        name: 'Doodle Dash Shorts',
        width: 1080,
        height: 1920,
        fps: 30,
        aspectRatio: '9:16',
        allowedDurations: [15, 30, 45, 60],
        config: {
          defaultFinalProfile: 'FINAL_1080P',
          defaultDraftProfile: 'DRAFT_FAST',
          defaultEngine: 'EEVEE',
          blenderFirst: true,
          aiVideoDefault: false,
        },
      },
    });

    return prisma.productionRenderProfile.findMany({ orderBy: { code: 'asc' } });
  }

  getEeveeConfig(code: ProductionRenderProfileCode) {
    return EEVEE_QUALITY_PRESETS[code];
  }

  async resolveShotEngine(input: {
    profileCode: ProductionRenderProfileCode;
    shotEngineOverride?: string | null;
  }) {
    if (input.shotEngineOverride === 'CYCLES' || input.shotEngineOverride === 'EEVEE') {
      return input.shotEngineOverride;
    }
    const profile = await prisma.productionRenderProfile.findUnique({
      where: { code: input.profileCode },
    });
    return profile?.engine ?? 'EEVEE';
  }
}

/**
 * Blender-first routing. Never silently falls back to paid AI video.
 */
export class BlenderFirstRouter {
  async routeRender(input?: { explicitAiVideo?: boolean; reason?: string }) {
    const settings = await new ProductionSettingsService().ensureDefaults();
    const blender = detectBlenderBinary();

    if (input?.explicitAiVideo) {
      if (!settings.aiVideoEnabled) {
        throw new AppError(
          'AI video is disabled by default. Enable in Production Settings and obtain Cost Guardian approval.',
          'AI_VIDEO_DISABLED',
          409,
        );
      }
      return {
        path: 'PAID_AI_VIDEO' as const,
        requiresApproval: true,
        reason: input.reason ?? 'Explicit specialty AI video request',
      };
    }

    if (blender.available && settings.preferLocalBlender) {
      return {
        path: 'LOCAL_BLENDER' as const,
        blender,
        engineDefault: settings.defaultFinalEngine,
      };
    }

    const workers = await prisma.renderWorker.findMany({
      where: { lastHeartbeatAt: { gte: new Date(Date.now() - 120_000) } },
    });
    if (workers.length && settings.remoteWorkerEnabled !== false) {
      return { path: 'REMOTE_BLENDER_WORKER' as const, workers };
    }

    if (settings.cloudRenderEnabled) {
      return { path: 'CLOUD_RENDER' as const };
    }

    throw new AppError(
      'BLOCKED: Blender cannot execute and no silent AI fallback is allowed. Configure local Blender (BLENDER_BIN), a remote worker, or explicitly request approved AI video.',
      'BLENDER_ROUTING_BLOCKED',
      409,
    );
  }
}

export class AnimationReuseEngine {
  async ensureSemanticLibrary(universeId: string) {
    const created = [];
    for (const code of SEMANTIC_ANIMATION_CODES) {
      const category =
        code === 'IDLE'
          ? 'IDLE'
          : ['WALK', 'RUN', 'JUMP', 'LAND', 'TURN', 'SIT', 'STAND'].includes(code)
            ? 'LOCOMOTION'
            : ['TALK', 'LISTEN', 'NOD', 'SHAKE_HEAD'].includes(code)
              ? 'DIALOGUE'
              : ['LAUGH', 'CRY', 'SURPRISED', 'SCARED', 'HAPPY', 'SAD', 'EXCITED', 'THINK'].includes(
                    code,
                  )
                ? 'EMOTIONAL'
                : ['PICK_UP', 'PUT_DOWN', 'HOLD', 'PUSH', 'PULL', 'WAVE', 'POINT'].includes(code)
                  ? 'INTERACTION'
                  : 'REACTION';

      const anim = await prisma.animationDefinition.upsert({
        where: { universeId_code: { universeId, code } },
        update: {},
        create: {
          universeId,
          code,
          name: code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
          category: category as
            | 'IDLE'
            | 'LOCOMOTION'
            | 'DIALOGUE'
            | 'EMOTIONAL'
            | 'INTERACTION'
            | 'REACTION',
          loopable: ['IDLE', 'WALK', 'RUN'].includes(code),
          status: 'MISSING',
          approved: false,
          notes: 'Semantic animation slot — upload real clip before production reuse.',
        },
      });
      await prisma.animationLibraryMeta.upsert({
        where: { animationDefinitionId: anim.id },
        update: {},
        create: {
          animationDefinitionId: anim.id,
          version: 1,
          tags: [code.toLowerCase()],
          qualityStatus: 'SLOT_ONLY',
          source: 'semantic-seed',
        },
      });
      created.push(anim);
    }
    return created;
  }

  /**
   * Decision order: exact → retarget → modify → procedural → new native → optional AI.
   */
  async decide(input: {
    universeId: string;
    semanticCode: string;
    characterId?: string;
    allowAiAssist?: boolean;
  }) {
    const settings = await new ProductionSettingsService().ensureDefaults();
    const anim = await prisma.animationDefinition.findUnique({
      where: {
        universeId_code: { universeId: input.universeId, code: input.semanticCode },
      },
    });
    const meta = anim
      ? await prisma.animationLibraryMeta.findUnique({
          where: { animationDefinitionId: anim.id },
        })
      : null;

    const path: string[] = [];
    if (anim?.approved && anim.status === 'APPROVED' && anim.assetId) {
      path.push('EXACT_REUSE');
      if (meta) {
        await prisma.animationLibraryMeta.update({
          where: { id: meta.id },
          data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
        });
      }
      await new AssetUsageIntelligence().record({
        assetType: 'animation',
        assetKey: anim.code,
      });
      return {
        decision: 'EXACT_REUSE' as const,
        animationId: anim.id,
        path,
        variationsAllowed: ['timing', 'speed', 'mirroring', 'blending', 'facial', 'eyes'],
      };
    }

    if (anim?.assetId) {
      path.push('REUSE_RETARGET', 'REUSE_MODIFY');
      return {
        decision: 'REUSE_MODIFY' as const,
        animationId: anim.id,
        path,
        note: 'Asset present but not fully approved — prefer modify/retarget over new.',
      };
    }

    if (!settings.animationReuseEnabled) {
      path.push('NEW_NATIVE_ANIMATION');
      return { decision: 'NEW_NATIVE_ANIMATION' as const, animationId: anim?.id ?? null, path };
    }

    path.push('PROCEDURAL_COMPOSITION');
    if (settings.animationReuseAggressiveness !== 'OFF') {
      return {
        decision: 'PROCEDURAL_COMPOSITION' as const,
        animationId: anim?.id ?? null,
        path,
        note: 'Compose from layers until a native clip exists.',
      };
    }

    path.push('NEW_NATIVE_ANIMATION');
    if (input.allowAiAssist) {
      path.push('OPTIONAL_AI_ASSISTANCE');
      return { decision: 'OPTIONAL_AI_ASSISTANCE' as const, animationId: null, path };
    }
    return { decision: 'NEW_NATIVE_ANIMATION' as const, animationId: anim?.id ?? null, path };
  }
}

export class MotionComposer {
  async compose(input: {
    shotId?: string;
    episodeId?: string;
    baseBody?: string;
    upperBodyGesture?: string;
    head?: string;
    eyes?: string;
    facialExpression?: string;
    lipSync?: object;
    propInteraction?: string;
  }) {
    const layers = {
      baseBodyMotion: input.baseBody ?? null,
      upperBodyGesture: input.upperBodyGesture ?? null,
      head: input.head ?? null,
      eyes: input.eyes ?? null,
      facialExpression: input.facialExpression ?? null,
      lipSync: input.lipSync ?? null,
      propInteraction: input.propInteraction ?? null,
    };
    const decisionPath = [];
    for (const [layer, value] of Object.entries(layers)) {
      if (value) decisionPath.push({ layer, source: value, mode: 'REUSE_OR_PROCEDURAL' });
    }
    return prisma.motionComposition.create({
      data: {
        shotId: input.shotId ?? null,
        episodeId: input.episodeId ?? null,
        layers,
        decisionPath,
        status: 'COMPOSED',
      },
    });
  }
}

export class ProceduralCameraService {
  listLanguage() {
    return PROCEDURAL_CAMERA_CODES.map((code) => ({
      code,
      verticalSafe: true,
      aspect: '9:16',
    }));
  }

  chooseForIntent(intent: string) {
    const normalized = intent.toLowerCase();
    if (normalized.includes('establish')) return 'ESTABLISHING';
    if (normalized.includes('react')) return 'REACTION';
    if (normalized.includes('follow') || normalized.includes('walk')) return 'FOLLOW';
    if (normalized.includes('close')) return 'CLOSE_UP';
    if (normalized.includes('two') || normalized.includes('together')) return 'TWO_SHOT';
    if (normalized.includes('reveal')) return 'REVEAL';
    return 'MEDIUM';
  }
}

export class CharacterFramingValidator {
  async validateShot(shotId: string) {
    const shot = await prisma.shot.findUnique({
      where: { id: shotId },
      include: { scene: true },
    });
    if (!shot) throw new AppError('Shot not found', 'SHOT_NOT_FOUND', 404);
    const characterIds = Array.isArray(shot.characterIds) ? (shot.characterIds as string[]) : [];
    const checks = [
      {
        code: 'FACE_SAFE_REGION',
        passed: true,
        severity: 'warning',
        message: 'Face safe-region check deferred until rendered draft frames exist.',
      },
      {
        code: 'EYES_VISIBLE',
        passed: true,
        severity: 'warning',
        message: 'Eyes-visible check deferred until draft.',
      },
      {
        code: 'GESTURES_VISIBLE',
        passed: true,
        severity: 'warning',
        message: 'Gesture crop check deferred until draft.',
      },
      {
        code: 'MULTI_CHARACTER_READABLE',
        passed: characterIds.length <= 2 || /TWO_SHOT|WIDE|ESTABLISHING/i.test(shot.cameraPreset ?? ''),
        severity: 'warning',
        message:
          characterIds.length > 2
            ? 'Multiple characters — prefer wider framing for 9:16 readability.'
            : 'Character count OK for vertical framing.',
      },
      {
        code: 'CAPTION_FACE_CLEARANCE',
        passed: true,
        severity: 'warning',
        message: 'Caption-safe vs face clearance validated at draft QC.',
      },
    ];
    const warnings = checks.filter((c) => !c.passed).map((c) => c.message);
    return prisma.framingValidationReport.create({
      data: {
        shotId,
        passed: warnings.length === 0,
        warnings,
        checks,
      },
    });
  }
}

export class ShotRenderCacheService {
  async buildFingerprint(shotId: string, profileCode: string) {
    const shot = await prisma.shot.findUnique({
      where: { id: shotId },
      include: { scene: { include: { location: true } } },
    });
    if (!shot) throw new AppError('Shot not found', 'SHOT_NOT_FOUND', 404);
    const characterIds = Array.isArray(shot.characterIds) ? (shot.characterIds as string[]) : [];
    const intakes = await prisma.productionAssetIntake.findMany({
      where: {
        OR: [
          { entityType: 'character', entityId: { in: characterIds } },
          shot.scene.locationId
            ? { entityType: 'location', entityId: shot.scene.locationId }
            : undefined,
        ].filter(Boolean) as object[],
      },
      orderBy: { version: 'desc' },
    });
    const dialogues = await prisma.dialogueLine.findMany({
      where: { episodeId: shot.scene.episodeId },
      take: 50,
    });
    const profile = await prisma.productionRenderProfile.findUnique({
      where: { code: profileCode },
    });
    const packages = characterIds.length
      ? await prisma.characterCanonicalPackage.findMany({
          where: { characterId: { in: characterIds } },
        })
      : [];
    const refVersions = characterIds.length
      ? await prisma.approvedReferenceVersion.findMany({
          where: { characterId: { in: characterIds } },
          orderBy: { versionNumber: 'desc' },
        })
      : [];
    const accessoryStates = characterIds.length
      ? await prisma.shotAccessoryState.findMany({
          where: { shotId, characterId: { in: characterIds } },
        })
      : [];
    const latestRefByCharacter = new Map<string, number>();
    for (const rv of refVersions) {
      if (!latestRefByCharacter.has(rv.characterId)) {
        latestRefByCharacter.set(rv.characterId, rv.versionNumber);
      }
    }
    return fingerprint([
      shot.id,
      shot.description,
      shot.durationSeconds,
      shot.cameraPreset,
      shot.lightingPreset,
      shot.characterIds,
      intakes.map((i) => ({ id: i.id, version: i.version, checksum: i.checksum, kind: i.kind })),
      packages.map((p) => ({
        characterId: p.characterId,
        dnaVersion: p.dnaVersion,
        primaryReferenceVersionId: p.primaryReferenceVersionId,
      })),
      [...latestRefByCharacter.entries()].map(([characterId, versionNumber]) => ({
        characterId,
        versionNumber,
      })),
      accessoryStates.map((a) => ({
        characterId: a.characterId,
        accessories: a.accessories,
      })),
      dialogues.map((d) => ({ id: d.id, text: d.text, speakerId: d.speakerId })),
      profileCode,
      profile?.engine,
      profile?.qualityPreset,
    ]);
  }

  async lookupOrMark(input: {
    shotId: string;
    profileCode: string;
    engine: string;
  }) {
    const settings = await new ProductionSettingsService().ensureDefaults();
    const fp = await this.buildFingerprint(input.shotId, input.profileCode);
    if (!settings.renderReuse && !settings.renderCacheEnabled) {
      return { reusable: false as const, entry: null, fingerprint: fp };
    }
    const existing = await prisma.shotRenderCacheEntry.findUnique({
      where: {
        shotId_fingerprint_profileCode: {
          shotId: input.shotId,
          fingerprint: fp,
          profileCode: input.profileCode,
        },
      },
    });
    if (existing?.approved && existing.outputUri) {
      return { reusable: true as const, entry: existing, fingerprint: fp };
    }
    const entry = await prisma.shotRenderCacheEntry.upsert({
      where: {
        shotId_fingerprint_profileCode: {
          shotId: input.shotId,
          fingerprint: fp,
          profileCode: input.profileCode,
        },
      },
      update: { engine: input.engine },
      create: {
        shotId: input.shotId,
        fingerprint: fp,
        profileCode: input.profileCode,
        engine: input.engine,
        approved: false,
      },
    });
    return { reusable: false as const, entry, fingerprint: fp };
  }

  async markApproved(entryId: string, outputUri: string, renderJobId?: string) {
    return prisma.shotRenderCacheEntry.update({
      where: { id: entryId },
      data: {
        approved: true,
        outputUri,
        renderJobId: renderJobId ?? null,
      },
    });
  }
}

export class VoiceGenerationCacheService {
  buildFingerprint(input: {
    characterId: string;
    voiceVersionId?: string | null;
    text: string;
    provider?: string | null;
    settings?: object | null;
  }) {
    return fingerprint([
      input.characterId,
      input.voiceVersionId ?? null,
      input.text,
      input.provider ?? null,
      input.settings ?? null,
    ]);
  }

  async getOrCreateSlot(input: {
    characterId: string;
    voiceVersionId?: string | null;
    text: string;
    provider?: string | null;
    settings?: object | null;
  }) {
    const settings = await new ProductionSettingsService().ensureDefaults();
    if (!settings.voiceCaching && !settings.voiceCacheEnabled) {
      return { cacheHit: false as const, entry: null, fingerprint: this.buildFingerprint(input) };
    }
    const fp = this.buildFingerprint(input);
    const existing = await prisma.voiceGenerationCacheEntry.findUnique({ where: { fingerprint: fp } });
    if (existing?.audioUri) {
      await prisma.voiceGenerationCacheEntry.update({
        where: { id: existing.id },
        data: { hitCount: { increment: 1 } },
      });
      return { cacheHit: true as const, entry: existing, fingerprint: fp };
    }
    const entry = await prisma.voiceGenerationCacheEntry.upsert({
      where: { fingerprint: fp },
      update: {},
      create: {
        fingerprint: fp,
        characterId: input.characterId,
        voiceVersionId: input.voiceVersionId ?? null,
        text: input.text,
        provider: input.provider ?? null,
        settings: input.settings ?? undefined,
      },
    });
    return { cacheHit: false as const, entry, fingerprint: fp };
  }
}

export class CostGuardian {
  async requestPaidGeneration(input: {
    episodeId?: string;
    shotId?: string;
    provider: string;
    model?: string;
    estimatedCost: number;
    reason: string;
  }) {
    const settings = await new ProductionSettingsService().ensureDefaults();
    const approval = await prisma.paidGenerationApproval.create({
      data: {
        episodeId: input.episodeId ?? null,
        shotId: input.shotId ?? null,
        provider: input.provider,
        model: input.model ?? null,
        estimatedCost: input.estimatedCost,
        reason: input.reason,
        status: 'PENDING',
      },
    });

    if (input.estimatedCost < settings.paidGenerationApprovalThresholdUsd) {
      // Still never auto-execute — caller must still APPROVE explicitly for AI video paths.
      return {
        approval,
        requiresExplicitApproval: true,
        message:
          'PAID GENERATION REQUEST recorded. APPROVE / CANCEL / USE BLENDER INSTEAD required — never silent spend.',
      };
    }
    return {
      approval,
      requiresExplicitApproval: true,
      message: `Estimated cost $${input.estimatedCost} exceeds threshold $${settings.paidGenerationApprovalThresholdUsd}. Explicit approval required.`,
    };
  }

  async decide(input: {
    approvalId: string;
    decision: 'APPROVE' | 'CANCEL' | 'USE_BLENDER_INSTEAD';
    by: string;
  }) {
    return prisma.paidGenerationApproval.update({
      where: { id: input.approvalId },
      data: {
        status: input.decision,
        decidedBy: input.by,
        decidedAt: new Date(),
      },
    });
  }

  async assertAiVideoAllowed(input: {
    characterIds: string[];
    providerSupportsReferenceImages: boolean;
    referenceConditioningSucceeded?: boolean;
    approvalId?: string;
  }) {
    const settings = await new ProductionSettingsService().ensureDefaults();
    if (!settings.aiVideoEnabled) {
      throw new AppError('AI video disabled by default.', 'AI_VIDEO_DISABLED', 409);
    }
    if (!input.approvalId) {
      throw new AppError('Cost Guardian approval required for paid AI video.', 'COST_GUARDIAN_REQUIRED', 409);
    }
    const approval = await prisma.paidGenerationApproval.findUnique({
      where: { id: input.approvalId },
    });
    if (!approval || approval.status !== 'APPROVE') {
      throw new AppError('Paid generation not approved.', 'PAID_GENERATION_NOT_APPROVED', 409);
    }
    for (const characterId of input.characterIds) {
      await referenceLockService.assertReferenceConditioning({
        characterId,
        providerSupportsReferenceImages: input.providerSupportsReferenceImages,
        referenceConditioningSucceeded: input.referenceConditioningSucceeded,
      });
    }
    return true;
  }
}

export class AssetUsageIntelligence {
  async record(input: {
    assetType: string;
    assetKey: string;
    episodeId?: string;
    shotId?: string;
  }) {
    return prisma.assetUsageEvent.upsert({
      where: {
        assetType_assetKey: { assetType: input.assetType, assetKey: input.assetKey },
      },
      update: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
        episodeId: input.episodeId ?? undefined,
        shotId: input.shotId ?? undefined,
      },
      create: {
        assetType: input.assetType,
        assetKey: input.assetKey,
        episodeId: input.episodeId ?? null,
        shotId: input.shotId ?? null,
        usageCount: 1,
      },
    });
  }

  async repetitionFlags(threshold = 25) {
    const rows = await prisma.assetUsageEvent.findMany({
      where: { usageCount: { gte: threshold } },
      orderBy: { usageCount: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      ...r,
      flag:
        'High reuse count — still allowed, but review for visual staleness before forcing a new asset.',
    }));
  }
}

export class RenderEstimator {
  async estimateEpisode(episodeId: string, profileCode: ProductionRenderProfileCode = 'FINAL_1080P') {
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: { scenes: { include: { shots: true } } },
    });
    if (!episode) throw new AppError('Episode not found', 'EPISODE_NOT_FOUND', 404);
    const profile = await prisma.productionRenderProfile.findUnique({
      where: { code: profileCode },
    });
    const fps = profile?.fps ?? 30;
    const shots = episode.scenes.flatMap((s) => s.shots);
    const cache = new ShotRenderCacheService();
    const toRerender: string[] = [];
    const reusable: string[] = [];
    let frameCount = 0;
    for (const shot of shots) {
      frameCount += Math.ceil((shot.durationSeconds || 0) * fps);
      const lookup = await cache.lookupOrMark({
        shotId: shot.id,
        profileCode,
        engine: profile?.engine ?? 'EEVEE',
      });
      if (lookup.reusable) reusable.push(shot.id);
      else toRerender.push(shot.id);
    }
    // Heuristic local compute units — not electricity truth.
    const minutesPerFrame = profileCode === 'PREMIUM' ? 0.05 : profileCode.startsWith('DRAFT') ? 0.005 : 0.02;
    const estimatedRenderMinutes = Number((toRerender.length === 0 ? 0 : frameCount * minutesPerFrame * (toRerender.length / Math.max(shots.length, 1))).toFixed(2));
    const estimate = await prisma.renderCostEstimate.create({
      data: {
        episodeId,
        profileCode,
        frameCount,
        estimatedRenderMinutes,
        estimatedLocalComputeUnits: estimatedRenderMinutes,
        estimatedExternalApiCost: 0,
        shotsToRerender: toRerender,
        shotsCacheReusable: reusable,
        assumptions: {
          note: 'Local GPU/electricity cost is not precisely known. External API cost is 0 for Blender-first path.',
          fps,
          labelLocal: 'LOCAL / NO API CHARGE (compute still uses machine resources)',
        },
      },
    });
    return estimate;
  }
}

export class QualityGuardianExtension {
  async evaluateFinalCandidate(input: {
    width?: number;
    height?: number;
    fps?: number;
    missingTextures?: boolean;
    brokenRigs?: boolean;
    lipSyncReady?: boolean;
    audioClipping?: boolean;
    blackFrames?: boolean;
    missingFrames?: boolean;
    renderCorruption?: boolean;
    unexpectedAssetVersionChange?: boolean;
  }) {
    const issues: Array<{ code: string; severity: 'error' | 'warning'; message: string }> = [];
    if ((input.width ?? 1080) !== 1080 || (input.height ?? 1920) !== 1920) {
      issues.push({
        code: 'RESOLUTION',
        severity: 'error',
        message: 'Final default must be 1080×1920 unless explicitly overridden.',
      });
    }
    if ((input.fps ?? 30) !== 30) {
      issues.push({
        code: 'FPS',
        severity: 'warning',
        message: 'Default FPS is 30; non-default must be intentional.',
      });
    }
    if (input.missingTextures) {
      issues.push({ code: 'TEXTURES', severity: 'error', message: 'Missing textures.' });
    }
    if (input.brokenRigs) {
      issues.push({ code: 'RIGS', severity: 'error', message: 'Broken rigs.' });
    }
    if (input.lipSyncReady === false) {
      issues.push({ code: 'LIP_SYNC', severity: 'error', message: 'Lip-sync not ready.' });
    }
    if (input.audioClipping) {
      issues.push({ code: 'AUDIO', severity: 'warning', message: 'Audio clipping detected.' });
    }
    if (input.blackFrames || input.missingFrames || input.renderCorruption) {
      issues.push({
        code: 'RENDER_CORRUPTION',
        severity: 'error',
        message: 'Black/missing/corrupt frames.',
      });
    }
    if (input.unexpectedAssetVersionChange) {
      issues.push({
        code: 'ASSET_VERSION_DRIFT',
        severity: 'error',
        message: 'Unexpected asset-version change vs locked manifest.',
      });
    }
    return {
      passed: !issues.some((i) => i.severity === 'error'),
      issues,
    };
  }
}

export class CostAnalyticsService {
  async summarize() {
    const entries = await prisma.costLedgerEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    const byCategory: Record<string, number> = {};
    let paidExternal = 0;
    let localNoApi = 0;
    for (const entry of entries) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + entry.amountUnits;
      if (entry.category.startsWith('LOCAL') || entry.category === 'LOCAL_COMPUTE') {
        localNoApi += entry.amountUnits;
      } else {
        paidExternal += entry.amountUnits;
      }
    }
    return {
      entries,
      byCategory,
      paidExternal,
      localNoApiCharge: localNoApi,
      labels: {
        local: 'LOCAL / NO API CHARGE (not literally free)',
        paid: 'PAID EXTERNAL',
      },
    };
  }

  async recordLocalCompute(episodeId: string, universeId: string, units: number, notes?: string) {
    return prisma.costLedgerEntry.create({
      data: {
        universeId,
        episodeId,
        category: 'LOCAL_COMPUTE',
        amountUnits: units,
        notes: notes ?? 'Local Blender compute estimate — not an API invoice.',
      },
    });
  }
}

export class AudioLibraryReuseService {
  static readonly SFX_SLOTS = [
    'footsteps',
    'running',
    'jump',
    'landing',
    'birds',
    'wind',
    'water',
    'door',
    'impact',
    'sparkle',
    'magic',
    'surprise',
    'success',
    'failure',
    'comedy',
    'suspense',
  ] as const;

  async ensureSlots(universeId: string) {
    const created = [];
    for (const code of AudioLibraryReuseService.SFX_SLOTS) {
      const clip = await prisma.soundClip.upsert({
        where: { universeId_code: { universeId, code } },
        update: {},
        create: {
          universeId,
          code,
          name: code.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
          tags: [code, 'reusable', 'sfx'],
          status: 'MISSING',
        },
      });
      created.push(clip);
    }
    for (const category of ['adventure', 'mystery', 'happy', 'ambience_meadow', 'transition_whoosh']) {
      await prisma.musicTrack.upsert({
        where: { universeId_code: { universeId, code: `music_${category}` } },
        update: {},
        create: {
          universeId,
          code: `music_${category}`,
          name: `${category} bed`,
          category,
          status: 'MISSING',
        },
      });
    }
    return created;
  }

  async preferReusable(universeId: string, code: string) {
    const clip = await prisma.soundClip.findUnique({
      where: { universeId_code: { universeId, code } },
    });
    if (clip?.status === 'APPROVED' && clip.assetId) {
      await new AssetUsageIntelligence().record({ assetType: 'sfx', assetKey: code });
      return { reuse: true as const, clip };
    }
    return {
      reuse: false as const,
      clip,
      note: 'Prefer uploading approved reusable SFX before paid generation.',
    };
  }
}

export class CostOptimizedWorkflowService {
  async bootstrap(universeId?: string) {
    const universe =
      universeId != null
        ? await prisma.universe.findUniqueOrThrow({ where: { id: universeId } })
        : await prisma.universe.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    if (!universe) {
      throw new AppError('No active universe for production bootstrap', 'UNIVERSE_REQUIRED', 404);
    }
    // User-facing brand migration without rewriting IMMUTABLE show-canon statements.
    if (universe.brandName !== PRODUCT_DISPLAY_NAME) {
      await prisma.universe.update({
        where: { id: universe.id },
        data: { brandName: PRODUCT_DISPLAY_NAME },
      });
    }
    const profiles = await new ProductionProfileService().seedProfiles();
    const settings = await new ProductionSettingsService().ensureDefaults();
    const animations = await new AnimationReuseEngine().ensureSemanticLibrary(universe.id);
    const audio = await new AudioLibraryReuseService().ensureSlots(universe.id);
    const { canonicalCharacterService } = await import('./canonical-characters');
    const characters = await canonicalCharacterService.bootstrapFoundingCharacters();
    return {
      universeId: universe.id,
      profiles,
      settings,
      animationSlots: animations.length,
      audioSlots: audio.length,
      characters,
    };
  }
}

export const productionSettingsService = new ProductionSettingsService();
export const productionProfileService = new ProductionProfileService();
export const blenderFirstRouter = new BlenderFirstRouter();
export const animationReuseEngine = new AnimationReuseEngine();
export const motionComposer = new MotionComposer();
export const proceduralCameraService = new ProceduralCameraService();
export const characterFramingValidator = new CharacterFramingValidator();
export const shotRenderCacheService = new ShotRenderCacheService();
export const voiceGenerationCacheService = new VoiceGenerationCacheService();
export const costGuardian = new CostGuardian();
export const assetUsageIntelligence = new AssetUsageIntelligence();
export const renderEstimator = new RenderEstimator();
export const qualityGuardianExtension = new QualityGuardianExtension();
export const costAnalyticsService = new CostAnalyticsService();
export const audioLibraryReuseService = new AudioLibraryReuseService();
export const costOptimizedWorkflowService = new CostOptimizedWorkflowService();
