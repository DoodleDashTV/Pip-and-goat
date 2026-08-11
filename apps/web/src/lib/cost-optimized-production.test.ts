import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import {
  DEFAULT_AI_VIDEO_ENABLED,
  DEFAULT_FINAL_ENGINE,
  DEFAULT_FINAL_FPS,
  DEFAULT_FINAL_RESOLUTION,
  PRODUCT_DISPLAY_NAME,
  SEMANTIC_ANIMATION_CODES,
} from '@doodle-dash/domain';
import {
  DEFAULT_PRODUCTION_SETTINGS,
  EEVEE_QUALITY_PRESETS,
  animationReuseEngine,
  blenderFirstRouter,
  costAnalyticsService,
  costGuardian,
  costOptimizedWorkflowService,
  motionComposer,
  productionManifestService,
  productionProfileService,
  productionSettingsService,
  qualityGuardianExtension,
  referenceLockService,
  shotRenderCacheService,
  voiceGenerationCacheService,
  VERTICAL_SLICE_EPISODE_ID,
  draftFinalOrchestrator,
} from '@doodle-dash/production';
import { studioSettingsService } from '@doodle-dash/characters';
import { AppError } from '@doodle-dash/shared';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

describe('Cost-optimized 1080p Doodle Dash Production', () => {
  beforeAll(() => {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) throw new Error('DATABASE_URL is required for tests');
    const psqlUrl = rawUrl.replace(/\?schema=public$/, '');
    execSync(
      `psql "${psqlUrl}" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"`,
      { env: process.env, stdio: 'inherit' },
    );
    execSync('pnpm exec prisma migrate deploy', {
      cwd: databaseDir,
      env: process.env,
      stdio: 'inherit',
    });
    execSync('pnpm exec tsx prisma/seed.ts', {
      cwd: databaseDir,
      env: process.env,
      stdio: 'inherit',
    });
  }, 180_000);

  it('defaults: 1080×1920, 30 FPS, EEVEE, AI video off', async () => {
    expect(DEFAULT_FINAL_RESOLUTION).toBe('1080x1920');
    expect(DEFAULT_FINAL_FPS).toBe(30);
    expect(DEFAULT_FINAL_ENGINE).toBe('EEVEE');
    expect(DEFAULT_AI_VIDEO_ENABLED).toBe(false);
    expect(PRODUCT_DISPLAY_NAME).toBe('Doodle Dash Production');
    expect(DEFAULT_PRODUCTION_SETTINGS.aiVideoEnabled).toBe(false);
    expect(DEFAULT_PRODUCTION_SETTINGS.renderCacheEnabled).toBe(true);
    expect(DEFAULT_PRODUCTION_SETTINGS.voiceCacheEnabled).toBe(true);
    expect(DEFAULT_PRODUCTION_SETTINGS.animationReuseEnabled).toBe(true);
  });

  it('seeds production profiles and EEVEE presets', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const boot = await costOptimizedWorkflowService.bootstrap(universe.id);
    expect(boot.profiles.map((p) => p.code).sort()).toEqual([
      'DRAFT_FAST',
      'DRAFT_HD',
      'FINAL_1080P',
      'PREMIUM',
    ]);
    const fast = boot.profiles.find((p) => p.code === 'DRAFT_FAST')!;
    const final = boot.profiles.find((p) => p.code === 'FINAL_1080P')!;
    const premium = boot.profiles.find((p) => p.code === 'PREMIUM')!;
    expect(fast).toMatchObject({ width: 540, height: 960, fps: 30, engine: 'EEVEE' });
    expect(final).toMatchObject({ width: 1080, height: 1920, fps: 30, engine: 'EEVEE', isDefaultFinal: true });
    expect(premium.engine).toBe('CYCLES');
    expect(EEVEE_QUALITY_PRESETS.FINAL_1080P.samples).toBeGreaterThanOrEqual(64);
    expect(productionProfileService.getEeveeConfig('DRAFT_FAST').samples).toBe(16);
  });

  it('allows Cycles per-shot override without forcing episode to Cycles', async () => {
    const engine = await productionProfileService.resolveShotEngine({
      profileCode: 'FINAL_1080P',
      shotEngineOverride: 'CYCLES',
    });
    expect(engine).toBe('CYCLES');
    const defaultEngine = await productionProfileService.resolveShotEngine({
      profileCode: 'FINAL_1080P',
      shotEngineOverride: null,
    });
    expect(defaultEngine).toBe('EEVEE');
  });

  it('Blender-first routing never silently falls back to AI', async () => {
    await productionSettingsService.update({ aiVideoEnabled: false, preferLocalBlender: true });
    await expect(blenderFirstRouter.routeRender({ explicitAiVideo: true })).rejects.toMatchObject({
      code: 'AI_VIDEO_DISABLED',
    });
    // Without Blender binary in CI, route should BLOCK — not spend API money.
    const previous = process.env.BLENDER_BIN;
    process.env.BLENDER_BIN = '/nonexistent/blender-binary';
    try {
      await expect(blenderFirstRouter.routeRender()).rejects.toBeInstanceOf(AppError);
    } finally {
      if (previous === undefined) delete process.env.BLENDER_BIN;
      else process.env.BLENDER_BIN = previous;
    }
  });

  it('Cost Guardian requires explicit paid approval', async () => {
    await productionSettingsService.update({ aiVideoEnabled: true });
    const req = await costGuardian.requestPaidGeneration({
      provider: 'Sora',
      model: 'sora-2',
      estimatedCost: 12,
      reason: 'specialty dream sequence',
    });
    expect(req.requiresExplicitApproval).toBe(true);
    expect(req.approval.status).toBe('PENDING');
    await costGuardian.decide({
      approvalId: req.approval.id,
      decision: 'USE_BLENDER_INSTEAD',
      by: 'tester',
    });
    await expect(
      costGuardian.assertAiVideoAllowed({
        characterIds: [],
        providerSupportsReferenceImages: true,
        approvalId: req.approval.id,
      }),
    ).rejects.toMatchObject({ code: 'PAID_GENERATION_NOT_APPROVED' });
    await productionSettingsService.update({ aiVideoEnabled: false });
  });

  it('animation reuse + motion composition', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    await animationReuseEngine.ensureSemanticLibrary(universe.id);
    expect(SEMANTIC_ANIMATION_CODES.length).toBeGreaterThanOrEqual(29);
    const decision = await animationReuseEngine.decide({
      universeId: universe.id,
      semanticCode: 'WAVE',
    });
    expect(['PROCEDURAL_COMPOSITION', 'NEW_NATIVE_ANIMATION', 'REUSE_MODIFY', 'EXACT_REUSE']).toContain(
      decision.decision,
    );
    const composition = await motionComposer.compose({
      episodeId: VERTICAL_SLICE_EPISODE_ID,
      baseBody: 'WALK',
      head: 'LOOK',
      facialExpression: 'HAPPY',
      upperBodyGesture: 'WAVE',
      lipSync: { ready: false },
    });
    expect(composition.status).toBe('COMPOSED');
    expect((composition.layers as Record<string, unknown>).baseBodyMotion).toBe('WALK');
  });

  it('shot fingerprint cache invalidates on change; unchanged reuses', async () => {
    const shot = await prisma.shot.findFirst({
      where: { scene: { episodeId: VERTICAL_SLICE_EPISODE_ID } },
      orderBy: { shotNumber: 'asc' },
    });
    expect(shot).toBeTruthy();
    const first = await shotRenderCacheService.lookupOrMark({
      shotId: shot!.id,
      profileCode: 'FINAL_1080P',
      engine: 'EEVEE',
    });
    expect(first.reusable).toBe(false);
    await shotRenderCacheService.markApproved(first.entry!.id, 'local://renders/shot-cache-test.mp4');
    const second = await shotRenderCacheService.lookupOrMark({
      shotId: shot!.id,
      profileCode: 'FINAL_1080P',
      engine: 'EEVEE',
    });
    expect(second.reusable).toBe(true);
    expect(second.fingerprint).toBe(first.fingerprint);

    await prisma.shot.update({
      where: { id: shot!.id },
      data: { description: `${shot!.description} [timing tweak]` },
    });
    const third = await shotRenderCacheService.lookupOrMark({
      shotId: shot!.id,
      profileCode: 'FINAL_1080P',
      engine: 'EEVEE',
    });
    expect(third.reusable).toBe(false);
    expect(third.fingerprint).not.toBe(first.fingerprint);
  });

  it('voice caching reuses identical fingerprints', async () => {
    const pip = await prisma.character.findFirstOrThrow({ where: { internalCode: 'CHAR_PIP_001' } });
    const input = {
      characterId: pip.id,
      text: 'Hello meadow!',
      provider: 'local-tts',
      settings: { emotion: 'happy', speed: 1 },
    };
    const a = await voiceGenerationCacheService.getOrCreateSlot(input);
    expect(a.cacheHit).toBe(false);
    await prisma.voiceGenerationCacheEntry.update({
      where: { fingerprint: a.fingerprint },
      data: { audioUri: 'local://voices/pip-hello.wav' },
    });
    const b = await voiceGenerationCacheService.getOrCreateSlot(input);
    expect(b.cacheHit).toBe(true);
    const c = await voiceGenerationCacheService.getOrCreateSlot({
      ...input,
      text: 'Hello meadow! changed',
    });
    expect(c.cacheHit).toBe(false);
  });

  it('production manifests lock versions for Meadow Map Mystery', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    await costOptimizedWorkflowService.bootstrap(universe.id);
    const manifest = await productionManifestService.lock(VERTICAL_SLICE_EPISODE_ID, 'DRAFT');
    const body = manifest.manifest as Record<string, unknown>;
    expect(body.output).toMatchObject({ width: 1080, height: 1920, fps: 30, engine: 'EEVEE' });
    expect(body.philosophy).toBe('CREATE_ONCE_VALIDATE_VERSION_LOCK_REUSE_ASSEMBLE_RENDER');
    expect(body.pipVersion).toBeTruthy();
    expect(body.goatVersion).toBeTruthy();
  });

  it('cost aggregation labels local vs paid', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    await costAnalyticsService.recordLocalCompute(VERTICAL_SLICE_EPISODE_ID, universe.id, 1.5);
    await prisma.costLedgerEntry.create({
      data: {
        universeId: universe.id,
        episodeId: VERTICAL_SLICE_EPISODE_ID,
        category: 'AI_VIDEO',
        amountUnits: 3.25,
        notes: 'should require guardian in real flow',
      },
    });
    const summary = await costAnalyticsService.summarize();
    expect(summary.localNoApiCharge).toBeGreaterThanOrEqual(1.5);
    expect(summary.paidExternal).toBeGreaterThanOrEqual(3.25);
    expect(summary.labels.local).toContain('LOCAL');
  });

  it('9:16 framing validator + quality guardian extension', async () => {
    const shot = await prisma.shot.findFirstOrThrow({
      where: { scene: { episodeId: VERTICAL_SLICE_EPISODE_ID } },
    });
    const { characterFramingValidator } = await import('@doodle-dash/production');
    const report = await characterFramingValidator.validateShot(shot.id);
    expect(report.shotId).toBe(shot.id);
    const qc = await qualityGuardianExtension.evaluateFinalCandidate({
      width: 1080,
      height: 1920,
      fps: 30,
      lipSyncReady: true,
    });
    expect(qc.passed).toBe(true);
    const bad = await qualityGuardianExtension.evaluateFinalCandidate({
      width: 720,
      height: 1280,
      fps: 24,
      missingTextures: true,
    });
    expect(bad.passed).toBe(false);
  });

  it('STRICT_CHARACTER_LOCK + AI reference conditioning fail-closed', async () => {
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);
    const pip = await prisma.character.findFirstOrThrow({ where: { internalCode: 'CHAR_PIP_001' } });
    await expect(
      referenceLockService.assertReferenceConditioning({
        characterId: pip.id,
        providerSupportsReferenceImages: false,
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      referenceLockService.assertReferenceConditioning({
        characterId: pip.id,
        providerSupportsReferenceImages: true,
        referenceConditioningSucceeded: false,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('final requires approved draft; pipeline resume remains available', async () => {
    await expect(draftFinalOrchestrator.generateFinal(VERTICAL_SLICE_EPISODE_ID)).rejects.toMatchObject({
      code: 'DRAFT_APPROVAL_REQUIRED',
    });
    const { buildEpisodeOrchestrator } = await import('@doodle-dash/production');
    expect(typeof buildEpisodeOrchestrator.resume).toBe('function');
  });

  it('brand bootstrap migrates universe brandName without breaking vertical slice', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    await costOptimizedWorkflowService.bootstrap(universe.id);
    const refreshed = await prisma.universe.findUniqueOrThrow({ where: { id: universe.id } });
    expect(refreshed.brandName).toBe('Doodle Dash Production');
    const episode = await prisma.episode.findUniqueOrThrow({
      where: { id: VERTICAL_SLICE_EPISODE_ID },
    });
    expect(episode.title).toContain('Meadow Map Mystery');
  });
});
