/**
 * The direction layer with a world attached.
 *
 * `@doodle-dash/direction` is pure and its own suite proves that. This file covers
 * the part that cannot be pure: storing blueprints, recording override provenance
 * including refusals, answering the control surface, and — the one that matters most
 * for the future — reading back a blueprint stored under an older schema version.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { directionService, readProviderStatus } from '@doodle-dash/production';
import { STUDIO_DISPLAY_NAME } from '@doodle-dash/domain';
import {
  BLUEPRINT_SCHEMA_VERSION,
  CHILD_SAFE_POLICY,
  GOAT_LOCK,
  PIP_LOCK,
  VALIDATION_SCENE_PLAN,
  FAULTY_SCENE_PLAN_INPUT,
} from '@doodle-dash/direction';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');
const EPISODE = VALIDATION_SCENE_PLAN.episodeId;

describe('direction layer persistence and control surface', () => {
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

  it('stores a blueprint and reads it back unchanged', async () => {
    const stored = await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    expect(stored.episodeId).toBe(EPISODE);
    expect(stored.schemaVersion).toBe(BLUEPRINT_SCHEMA_VERSION);
    expect(stored.shotCount).toBe(VALIDATION_SCENE_PLAN.beats.length);
    expect(stored.validationStatus).toBe('PASS');

    const readBack = await directionService.latestForEpisode(EPISODE);
    expect(readBack).not.toBeNull();
    expect(readBack!.contentHash).toBe(stored.contentHash);
    expect(JSON.stringify(readBack!.blueprint.content)).toBe(
      JSON.stringify(stored.blueprint.content),
    );
  });

  // Planning the same plan twice must not accumulate rows. The content hash is the
  // identity of a plan, so a repeat call is an upsert rather than a new version.
  it('is idempotent: replanning an identical plan does not create a second row', async () => {
    const first = await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    const second = await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    expect(second.id).toBe(first.id);
    expect(second.contentHash).toBe(first.contentHash);
    const count = await prisma.productionBlueprintRecord.count({
      where: { episodeId: EPISODE, contentHash: first.contentHash },
    });
    expect(count).toBe(1);
  });

  it('finds a stored blueprint by its content hash', async () => {
    const stored = await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    const found = await directionService.byContentHash(EPISODE, stored.contentHash);
    expect(found?.id).toBe(stored.id);
    expect(await directionService.byContentHash(EPISODE, 'f'.repeat(64))).toBeNull();
  });

  it('stores a failing blueprint so a reviewer can read the refusals', async () => {
    const stored = await directionService.planAndStore({ scenePlan: { ...FAULTY_SCENE_PLAN_INPUT } });
    expect(stored.validationStatus).toBe('FAIL');
    expect(stored.errorCount).toBeGreaterThan(0);

    // Stored, but unable to reach a renderer.
    await expect(directionService.renderProjection(stored.episodeId)).rejects.toThrow();
  });

  it('refuses a render projection for an episode with no blueprint', async () => {
    await expect(directionService.renderProjection('NO_SUCH_EPISODE')).rejects.toMatchObject({
      code: 'BLUEPRINT_REQUIRED',
    });
  });

  it('projects a passing blueprint for render', async () => {
    await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    const projection = await directionService.renderProjection(EPISODE);
    expect(projection.shots.length).toBe(VALIDATION_SCENE_PLAN.beats.length);
    expect(projection.shots[0].shotMeta.placements).toBeTruthy();
  });
});

describe('override provenance survives the round trip', () => {
  /** Shot ids come from the plan, so ask the planner rather than hardcoding them. */
  async function firstShotId(): Promise<string> {
    const stored = await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    return stored.blueprint.content.shots[0].shotId;
  }

  it('records an accepted override with its before and after values', async () => {
    const override = {
      path: 'lighting.recipe',
      shotId: await firstShotId(),
      value: 'DAY_SOFT',
      by: 'director@tivvlejoy.test',
      reason: 'softer key for the hook',
    };
    const result = await directionService.applyOverride({
      episodeId: EPISODE,
      scenePlan: VALIDATION_SCENE_PLAN,
      override,
    });
    expect(result.accepted).toBe(true);
    expect(result.refusedBecause).toBeUndefined();

    const rows = await prisma.directorOverrideRecord.findMany({
      where: { blueprintId: result.blueprint.id, path: override.path },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].createdBy).toBe(override.by);
    expect(rows[0].reason).toBe(override.reason);
    expect(rows[0].refusedBecause).toBeNull();
  });

  // A refused attempt is more interesting than an accepted one: it is evidence that
  // someone tried to loosen a lock, and it has to be visible rather than swallowed.
  it('records a refused override, and refuses it', async () => {
    const override = {
      path: 'emotion.intensity',
      shotId: await firstShotId(),
      value: 1,
      by: 'director@tivvlejoy.test',
      reason: 'wanted it bigger',
    };
    const result = await directionService.applyOverride({
      episodeId: EPISODE,
      scenePlan: VALIDATION_SCENE_PLAN,
      override,
    });
    expect(result.accepted).toBe(false);
    expect(result.refusedBecause).toBeTruthy();

    const row = await prisma.directorOverrideRecord.findFirst({
      where: { blueprintId: result.blueprint.id, path: override.path },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.refusedBecause).toBeTruthy();
  });

  it('refuses an override aimed at a protected path', async () => {
    const result = await directionService.applyOverride({
      episodeId: EPISODE,
      scenePlan: VALIDATION_SCENE_PLAN,
      override: {
        path: 'audio.voiceRequests',
        shotId: await firstShotId(),
        value: 'some_other_voice_v9',
        by: 'director@tivvlejoy.test',
        reason: 'trying a different voice',
      },
    });
    expect(result.accepted).toBe(false);
    expect(result.refusedBecause).toBeTruthy();
  });
});

describe('targeted invalidation is computed against what is stored', () => {
  it('invalidates every shot when nothing is stored yet', async () => {
    const result = await directionService.invalidationAgainstStored({
      episodeId: 'NEVER_PLANNED_EPISODE',
      scenePlan: { ...VALIDATION_SCENE_PLAN, episodeId: 'NEVER_PLANNED_EPISODE' },
    });
    expect(result.hasStored).toBe(false);
    expect(result.invalidatedShotIds.length).toBe(VALIDATION_SCENE_PLAN.beats.length);
    expect(result.reusableShotIds).toEqual([]);
  });

  it('reuses every shot when the plan has not changed', async () => {
    await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    const result = await directionService.invalidationAgainstStored({
      episodeId: EPISODE,
      scenePlan: VALIDATION_SCENE_PLAN,
    });
    expect(result.hasStored).toBe(true);
    expect(result.invalidatedShotIds).toEqual([]);
    expect(result.reusableShotIds.length).toBe(VALIDATION_SCENE_PLAN.beats.length);
    expect(result.episodeKeyChanged).toBe(false);
  });

  // The claim the whole cache design rests on: a lighting change on one shot is a
  // one-shot rerender, not an episode rerender.
  it('invalidates only the shot a lighting override touched', async () => {
    const stored = await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    const result = await directionService.invalidationAgainstStored({
      episodeId: EPISODE,
      scenePlan: VALIDATION_SCENE_PLAN,
      overrides: [
        {
          path: 'lighting.recipe',
          shotId: stored.blueprint.content.shots[0].shotId,
          value: 'DAY_SOFT',
          by: 'director@tivvlejoy.test',
          reason: 'softer key',
        },
      ],
    });
    expect(result.hasStored).toBe(true);
    expect(result.invalidatedShotIds.length).toBe(1);
    expect(result.reusableShotIds.length).toBe(VALIDATION_SCENE_PLAN.beats.length - 1);
    expect(result.episodeKeyChanged).toBe(true);
  });
});

describe('the control surface answers what a phone needs to show', () => {
  it('reports shots, cost, validation and the studio name in one call', async () => {
    await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    const surface = await directionService.controlSurface(EPISODE);

    expect(surface.studioName).toBe(STUDIO_DISPLAY_NAME);
    expect(surface.blueprint).not.toBeNull();
    expect(surface.shots.length).toBe(VALIDATION_SCENE_PLAN.beats.length);
    for (const shot of surface.shots) {
      expect(shot.composition.length).toBeGreaterThan(0);
      expect(shot.lightingRecipe.length).toBeGreaterThan(0);
      expect(shot.qcStatus).toBe('PASS');
      expect(shot.failedChecks).toEqual([]);
      expect(shot.estimatedCloudCostUsd).toBeGreaterThanOrEqual(0);
    }
  });

  // The cost estimate exists so a human can decide before spending, which means it
  // has to be available with nothing rendered and no provider authorized.
  it('gives a cost estimate before anything is generated', async () => {
    const surface = await directionService.controlSurface(EPISODE);
    expect(surface.blueprint!.estimatedCloudCostUsd).toBeGreaterThan(0);
    expect(surface.provider.requiresAuthorization).toBe(true);
    expect(surface.provider.localAvailable).toBe(true);
  });

  it('publishes the override bounds so the UI cannot offer an out-of-range control', async () => {
    const surface = await directionService.controlSurface(EPISODE);
    expect(surface.overrideBounds.emotionIntensityMax).toBe(CHILD_SAFE_POLICY.maxIntensity);
    expect(surface.overrideBounds.voiceIds[PIP_LOCK.characterCode]).toBe(PIP_LOCK.voice.voiceId);
    expect(surface.overrideBounds.voiceIds[GOAT_LOCK.characterCode]).toBe(GOAT_LOCK.voice.voiceId);
  });

  it('returns an empty surface rather than throwing for an unplanned episode', async () => {
    const surface = await directionService.controlSurface('NOT_PLANNED');
    expect(surface.blueprint).toBeNull();
    expect(surface.shots).toEqual([]);
    expect(surface.issues).toEqual([]);
    expect(surface.provider.requiresAuthorization).toBe(true);
  });
});

describe('a blueprint stored under an older schema version still loads', () => {
  /**
   * The migration path, exercised the only way it can be honestly exercised: write a
   * row that claims an older version, then read it through the service. Today's
   * migration list is empty, so the meaningful assertion is that an unknown-old
   * version is refused loudly rather than silently mangled — which is what protects
   * a future reader from a half-understood document.
   */
  it('refuses a stored version it does not recognise instead of guessing', async () => {
    const stored = await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    const row = await prisma.productionBlueprintRecord.findUniqueOrThrow({
      where: { id: stored.id },
    });
    const alien = await prisma.productionBlueprintRecord.create({
      data: {
        episodeId: 'ALIEN_VERSION_EPISODE',
        schemaVersion: 'ddp-production-blueprint-v0-unknown',
        contentHash: 'a'.repeat(64),
        cacheKey: 'b'.repeat(32),
        seed: 'alien-seed',
        status: 'DRAFT',
        validationStatus: row.validationStatus,
        errorCount: 0,
        warningCount: 0,
        shotCount: row.shotCount,
        durationSeconds: row.durationSeconds,
        estimatedCloudCostUsd: row.estimatedCloudCostUsd,
        content: {
          ...(row.content as object),
          schemaVersion: 'ddp-production-blueprint-v0-unknown',
        },
        meta: row.meta as object,
      },
    });
    await expect(directionService.latestForEpisode(alien.episodeId)).rejects.toThrow();
  });

  it('reads a current-version row without needing a migration', async () => {
    const stored = await directionService.planAndStore({ scenePlan: VALIDATION_SCENE_PLAN });
    const readBack = await directionService.latestForEpisode(EPISODE);
    expect(readBack!.blueprint.content.schemaVersion).toBe(BLUEPRINT_SCHEMA_VERSION);
    expect(readBack!.contentHash).toBe(stored.contentHash);
  });
});

describe('nothing here can authorize spend', () => {
  it('reports the provider state without being able to change it', async () => {
    const surface = await directionService.controlSurface(EPISODE);
    expect(surface.provider).toEqual(readProviderStatus());
    expect(surface.provider.paidGpuLaunchAllowed).toBe(false);
    expect(surface.provider.explanation).toContain('requires authorization');
  });
});
