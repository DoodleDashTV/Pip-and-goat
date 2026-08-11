import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES, DOODLE_GUARDIAN_THRESHOLD } from '@doodle-dash/domain';
import {
  assetIntakeService,
  characterAssetValidator,
  referenceLockService,
  voiceProductionService,
  shotPackageService,
  shortsProfileService,
  buildEpisodeOrchestrator,
  publishingPackageService,
  productionReadinessService,
  doodleGuardian,
} from '@doodle-dash/production';
import { LipSyncService } from '@doodle-dash/audio';
import { studioSettingsService } from '@doodle-dash/characters';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');
const VERTICAL_SLICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Production readiness + vertical slice', () => {
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

  it('keeps STRICT_CHARACTER_LOCK enabled', async () => {
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);
  });

  it('seeds missing character intake slots without inventing files', async () => {
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    const intakes = await prisma.productionAssetIntake.findMany({
      where: { entityType: 'character', entityId: pip.id },
    });
    expect(intakes.length).toBeGreaterThanOrEqual(8);
    expect(intakes.every((i) => !i.storageLocation || i.approvalStatus === 'MISSING')).toBe(true);
  });

  it('marks missing character assets as validation failures that block final', async () => {
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    const result = await characterAssetValidator.validate(pip.id);
    expect(result.passed).toBe(false);
    expect(result.report.blockedFinal).toBe(true);
    expect(result.checks.some((c) => c.code === 'MODEL_EXISTS' && !c.passed)).toBe(true);
  });

  it('rejects intake registration without a file or markMissing', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    await expect(
      assetIntakeService.register({
        universeId: universe.id,
        entityType: 'character',
        entityId: pip.id,
        kind: 'CHARACTER_BLEND',
      }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_ASSET_REQUIRED' });
  });

  it('fails AI reference conditioning without approved immutable reference', async () => {
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    await expect(
      referenceLockService.assertReferenceConditioning({
        characterId: pip.id,
        providerSupportsReferenceImages: true,
        referenceConditioningSucceeded: true,
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_LOCK_REQUIRED' });
  });

  it('fails generation when reference conditioning fails (no text-only fallback)', async () => {
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    await prisma.approvedCharacterReference.create({
      data: {
        characterId: pip.id,
        role: 'PRIMARY',
        immutable: true,
        approvedAt: new Date(),
        approvedBy: 'test',
      },
    });
    await expect(
      referenceLockService.assertReferenceConditioning({
        characterId: pip.id,
        providerSupportsReferenceImages: true,
        referenceConditioningSucceeded: false,
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_CONDITIONING_FAILED' });
  });

  it('blocks voice approval and final voice use without provider voice ID', async () => {
    const goat = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.GOAT },
    });
    await voiceProductionService.getOrCreate(goat.id);
    await expect(voiceProductionService.approve(goat.id, 'tester')).rejects.toMatchObject({
      code: 'VOICE_CONFIG_INCOMPLETE',
    });
    await expect(voiceProductionService.assertApprovedForFinal(goat.id)).rejects.toMatchObject({
      code: 'VOICE_NOT_APPROVED',
    });
  });

  it('builds blocked shot packages when characters are not production ready', async () => {
    const shot = await prisma.shot.findFirstOrThrow({
      where: { scene: { episodeId: VERTICAL_SLICE_ID } },
    });
    const pkg = await shotPackageService.buildForShot(shot.id);
    expect(pkg.status).toBe('BLOCKED');
    expect(Array.isArray(pkg.blockedReasons)).toBe(true);
  });

  it('ensures DOODLE_DASH_SHORTS 9:16 profile and duration validation', async () => {
    const profile = await shortsProfileService.ensureDefault();
    expect(profile.width).toBe(1080);
    expect(profile.height).toBe(1920);
    expect(profile.aspectRatio).toBe('9:16');
    expect(shortsProfileService.validateDuration(30, profile.allowedDurations).ok).toBe(true);
    expect(shortsProfileService.validateDuration(12, profile.allowedDurations).ok).toBe(false);
  });

  it('runs BUILD EPISODE until asset dependency boundary', async () => {
    const run = await buildEpisodeOrchestrator.start({
      episodeId: VERTICAL_SLICE_ID,
      durationTargetSec: 30,
    });
    expect(run.status).toBe('BLOCKED');
    const blocked = run.stages.filter((s) => s.status === 'BLOCKED');
    expect(blocked.some((s) => s.stage === 'ASSET_CHECK')).toBe(true);
    const story = run.stages.find((s) => s.stage === 'STORY_APPROVAL');
    expect(story?.status).toBe('SUCCEEDED');
  });

  it('blocks BUILD EPISODE continuity on hard canon conflicts', async () => {
    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: VERTICAL_SLICE_ID } });
    const original = episode.synopsis;
    await prisma.episode.update({
      where: { id: VERTICAL_SLICE_ID },
      data: {
        synopsis: `not ${'Pip is a founding character of the Doodle Dash Universe (CHAR_PIP_001).'}`,
      },
    });
    const run = await buildEpisodeOrchestrator.start({
      episodeId: VERTICAL_SLICE_ID,
      durationTargetSec: 30,
    });
    await prisma.episode.update({
      where: { id: VERTICAL_SLICE_ID },
      data: { synopsis: original },
    });
    const continuity = run.stages.find((s) => s.stage === 'CONTINUITY_CHECK');
    expect(continuity?.status).toBe('BLOCKED');
  });

  it('resumes pipeline without losing prior run history', async () => {
    const first = await buildEpisodeOrchestrator.start({
      episodeId: VERTICAL_SLICE_ID,
      durationTargetSec: 30,
    });
    const second = await buildEpisodeOrchestrator.resume(first.id);
    expect(second.id).not.toBe(first.id);
    expect(first.status).toBe('BLOCKED');
    expect(second.status).toBe('BLOCKED');
    const stillThere = await prisma.episodePipelineRun.findUnique({
      where: { id: first.id },
      include: { stages: true },
    });
    expect(stillThere?.stages.length ?? 0).toBeGreaterThan(0);
  });

  it('enforces Doodle Guardian threshold semantics', () => {
    const result = doodleGuardian.score({
      text: 'Pip and Goat explore the meadow together.',
      canonFacts: [],
    });
    expect(result.threshold).toBe(DOODLE_GUARDIAN_THRESHOLD);
    expect(result.passed).toBe(true);
  });

  it('gates final lip sync when mouth controls are missing', () => {
    const lip = new LipSyncService();
    expect(() =>
      lip.assertFacialControlsForFinal({
        characterCode: FOUNDING_CODES.PIP,
        approvedFacialRig: false,
        availableVisemes: [],
      }),
    ).toThrow(/Lip-sync blocked/);
  });

  it('builds publishing package metadata but blocks without final MP4', async () => {
    const built = await publishingPackageService.buildForEpisode(VERTICAL_SLICE_ID);
    expect(built.package.finalMp4).toBeNull();
    expect(built.release.status).toBe('BLOCKED');
    expect(built.package.autoPublish).toBe(false);
  });

  it('snapshots readiness with BLOCKED model/voice/reference for Pip and Goat', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const rows = await productionReadinessService.snapshotUniverse(universe.id);
    const pipModel = rows.find(
      (r) => r.entityKey === FOUNDING_CODES.PIP && r.area === 'CHARACTER_MODEL',
    );
    const goatVoice = rows.find((r) => r.entityKey === FOUNDING_CODES.GOAT && r.area === 'VOICE');
    expect(pipModel?.state).toBe('BLOCKED');
    expect(goatVoice?.state).toBe('BLOCKED');
  });
});
