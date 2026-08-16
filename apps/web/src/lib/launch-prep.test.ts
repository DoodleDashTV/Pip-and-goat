import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import {
  LocalFilesystemStorage,
  MissingObjectStorage,
  storageKeyFor,
  createDefaultObjectStorage,
} from '@doodle-dash/shared';
import {
  characterOnboardingService,
  facialMappingService,
  referenceApprovalService,
  environmentOnboardingService,
  propOnboardingService,
  voiceOnboardingService,
  blenderWorkerHealthService,
  shotInspectorService,
  episodeReadinessAggregator,
  draftFinalOrchestrator,
  productionManifestService,
  referenceLockService,
  buildEpisodeOrchestrator,
  VERTICAL_SLICE_EPISODE_ID,
  REQUIRED_MOUTH_CONTROLS,
} from '@doodle-dash/production';
import { studioSettingsService } from '@doodle-dash/characters';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

describe('First episode launch prep', () => {
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

  it('provides storage provider abstraction (local + missing)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'doodle-storage-'));
    const local = new LocalFilesystemStorage(dir);
    const key = storageKeyFor('original_uploads', ['test', 'a.bin']);
    const uri = await local.putObject(key, new Uint8Array([1, 2, 3]), 'application/octet-stream');
    expect(uri.startsWith('local://')).toBe(true);
    expect(await local.exists?.(key)).toBe(true);
    const missing = new MissingObjectStorage();
    await expect(missing.putObject()).rejects.toMatchObject({ code: 'STORAGE_NOT_CONFIGURED' });
    expect(createDefaultObjectStorage()).toBeTruthy();
  });

  it('validates character upload hash/version and never auto production-ready', async () => {
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    const universe = await prisma.universe.findFirstOrThrow();
    const bytes = new Uint8Array([0x42, 0x4c, 0x45, 0x4e, 0x44]); // fake header bytes, not a real blend
    const result = await characterOnboardingService.uploadModel({
      characterId: pip.id,
      universeId: universe.id,
      fileName: 'pip_test.blend',
      bytes,
    });
    expect(result.intake.version).toBeGreaterThanOrEqual(1);
    expect(result.stored.checksum).toHaveLength(64);
    expect(result.inspection.productionReadyEligible).toBe(false);
    expect(result.validation.passed).toBe(false);
  });

  it('stores facial mappings and blocks lip-sync until required mouth controls approved', async () => {
    const goat = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.GOAT },
    });
    const incomplete = Object.fromEntries(REQUIRED_MOUTH_CONTROLS.map((k) => [k, null]));
    await facialMappingService.saveMappings({
      characterId: goat.id,
      mappings: incomplete,
    });
    await expect(facialMappingService.approve(goat.id, 1, 'tester')).rejects.toMatchObject({
      code: 'FACIAL_MAP_INCOMPLETE',
    });
    const complete = Object.fromEntries(REQUIRED_MOUTH_CONTROLS.map((k) => [k, `SK_${k}`]));
    await facialMappingService.saveMappings({ characterId: goat.id, mappings: complete });
    const approved = await facialMappingService.approve(goat.id, 1, 'tester');
    expect(approved.approved).toBe(true);
    await expect(facialMappingService.assertLipSyncReady(goat.id)).resolves.toBeTruthy();
  });

  it('creates immutable reference versions without overwrite', async () => {
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    const universe = await prisma.universe.findFirstOrThrow();
    const asset = await prisma.asset.create({
      data: {
        universeId: universe.id,
        name: 'pip-front.png',
        type: 'REFERENCE_IMAGE',
        storageLocation: 'local://original_uploads/pip-front.png',
        missing: false,
      },
    });
    const image = await prisma.characterReferenceImage.create({
      data: {
        universeId: universe.id,
        characterId: pip.id,
        assetId: asset.id,
        title: 'Pip front',
        viewType: 'front',
      },
    });
    const v1 = await referenceApprovalService.approveVersion({
      characterId: pip.id,
      primaryImageId: image.id,
      approvedBy: 'tester',
      silhouetteNotes: 'round ears',
    });
    const asset2 = await prisma.asset.create({
      data: {
        universeId: universe.id,
        name: 'pip-front-v2.png',
        type: 'REFERENCE_IMAGE',
        storageLocation: 'local://original_uploads/pip-front-v2.png',
        missing: false,
      },
    });
    const image2 = await prisma.characterReferenceImage.create({
      data: {
        universeId: universe.id,
        characterId: pip.id,
        assetId: asset2.id,
        title: 'Pip front v2',
        viewType: 'front',
      },
    });
    const v2 = await referenceApprovalService.approveVersion({
      characterId: pip.id,
      primaryImageId: image2.id,
      approvedBy: 'tester',
    });
    expect(v2.versionNumber).toBe(v1.versionNumber + 1);
    const stillV1 = await prisma.approvedReferenceVersion.findUniqueOrThrow({ where: { id: v1.id } });
    expect(stillV1.immutable).toBe(true);
  });

  it('validates meadow environment and map prop blockers', async () => {
    const meadow = await prisma.location.findFirstOrThrow({
      where: { internalCode: 'LOC_MEADOW_001' },
    });
    const report = await environmentOnboardingService.validate(meadow.id);
    expect(report.passed).toBe(false);
    const prop = await propOnboardingService.ensureMapPropProfile();
    expect(prop?.profile.productionReady).toBe(false);
    expect(prop?.profile.blockedReason).toMatch(/PROP ASSET REQUIRED/);
  });

  it('versions voice approval and refuses fabricated auditions', async () => {
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    await voiceOnboardingService.configureAndVersion({
      characterId: pip.id,
      provider: 'test-provider',
      voiceId: 'real-looking-but-test-id',
    });
    delete process.env.VOICE_PROVIDER_API_KEY;
    const audition = await voiceOnboardingService.generateAudition(pip.id);
    expect(audition.status).toBe('AUDITION_BLOCKED');
    const approved = await voiceOnboardingService.decide({
      characterId: pip.id,
      versionNumber: 1,
      decision: 'APPROVE',
      by: 'tester',
    });
    expect(approved.status).toBe('APPROVED');
  });

  it('reports blender worker status and self-test orchestration', async () => {
    const status = await blenderWorkerHealthService.status();
    expect(status.blender).toBeTruthy();
    const test = await blenderWorkerHealthService.runSelfTest();
    expect(['SUCCEEDED', 'FAILED']).toContain(test.status);
    if (!status.blender.available) {
      expect(test.status).toBe('FAILED');
      expect(test.logExcerpt).toMatch(/BLENDER EXECUTION REQUIRED/);
    }
  });

  it('calculates shot blockers with deep-link hrefs', async () => {
    const shot = await prisma.shot.findFirstOrThrow({
      where: { scene: { episodeId: VERTICAL_SLICE_EPISODE_ID } },
    });
    const inspection = await shotInspectorService.inspectShot(shot.id);
    expect(inspection.canAdvanceToNativeDraft).toBe(false);
    expect(inspection.blockers.some((b) => b.href.startsWith('/'))).toBe(true);
  });

  it('aggregates episode readiness and gates draft/final', async () => {
    const checklist = await episodeReadinessAggregator.buildChecklist(VERTICAL_SLICE_EPISODE_ID);
    expect(checklist.items.find((i) => i.category === 'STORY')?.state).toBe('READY');
    expect(checklist.items.find((i) => i.category === 'PROP')?.state).toBe('BLOCKED');
    expect(checklist.draftEnabled).toBe(false);
    await expect(draftFinalOrchestrator.generateFirstDraft(VERTICAL_SLICE_EPISODE_ID)).rejects.toMatchObject({
      code: 'DRAFT_GATED',
    });
    await expect(draftFinalOrchestrator.generateFinal(VERTICAL_SLICE_EPISODE_ID)).rejects.toMatchObject({
      code: 'FINAL_RENDER_REFUSED',
    });
  });

  it('keeps STRICT_CHARACTER_LOCK and AI reference fail-closed', async () => {
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);
    const goat = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.GOAT },
    });
    await expect(
      referenceLockService.assertReferenceConditioning({
        characterId: goat.id,
        providerSupportsReferenceImages: false,
        referenceConditioningSucceeded: true,
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_LOCK_REQUIRED' });
  });

  it('resumes pipeline without deleting prior run history', async () => {
    const first = await buildEpisodeOrchestrator.start({
      episodeId: VERTICAL_SLICE_EPISODE_ID,
      durationTargetSec: 30,
    });
    const second = await buildEpisodeOrchestrator.resume(first.id);
    expect(second.id).not.toBe(first.id);
    const prior = await prisma.episodePipelineRun.findUnique({
      where: { id: first.id },
      include: { stages: true },
    });
    expect(prior?.stages.some((s) => s.status === 'SUCCEEDED')).toBe(true);
  });

  it('locks production manifest structure for reproducibility', async () => {
    // Manifest lock requires data; create minimal approved voice/ref already partly present for Pip.
    const manifest = await productionManifestService.lock(VERTICAL_SLICE_EPISODE_ID, 'DRAFT');
    expect(manifest.locked).toBe(true);
    expect((manifest.manifest as { profile?: string }).profile).toBe('DOODLE_DASH_SHORTS');
  });
});
