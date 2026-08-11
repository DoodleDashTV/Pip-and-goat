import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { studioSettingsService } from '@doodle-dash/characters';
import {
  canonicalCharacterService,
  characterOnboardingService,
  durableStorageOpsService,
  productionManifestService,
  productionStorageService,
  VERTICAL_SLICE_EPISODE_ID,
} from '@doodle-dash/production';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

function fakeBlend(tag: string) {
  // Not a real Blender file — binary persistence / candidate gating only.
  return new TextEncoder().encode(`BLENDER-TEST-BYTES-${tag}-${Date.now()}`);
}

describe('Pip/Goat model candidate + durable persistence gates', () => {
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

  it('creates Pip/Goat model candidates without production-ready, keeps STRICT_CHARACTER_LOCK', async () => {
    await canonicalCharacterService.bootstrapFoundingCharacters();
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);

    const universe = await prisma.universe.findFirstOrThrow();
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    const goat = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.GOAT },
    });

    await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.PIP,
      fileName: 'pip_primary_reference.jpeg',
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9, ...new TextEncoder().encode('pip')]),
      contentType: 'image/jpeg',
      autoApprove: true,
      approvedBy: 'tester',
    });
    await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.GOAT,
      fileName: 'goat_primary_reference.jpeg',
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9, ...new TextEncoder().encode('goat')]),
      contentType: 'image/jpeg',
      autoApprove: true,
      approvedBy: 'tester',
    });

    const pipModel = await characterOnboardingService.uploadModel({
      characterId: pip.id,
      universeId: universe.id,
      fileName: 'pip_production.blend',
      bytes: fakeBlend('pip'),
      contentType: 'application/octet-stream',
    });
    expect(pipModel.status).toBe('CANDIDATE / BLOCKED');
    expect(pipModel.stored.checksum).toHaveLength(64);
    expect(pipModel.stored.category).toBe('character-models');
    expect(pipModel.model.productionReady).toBe(false);
    expect(pipModel.model.approved).toBe(false);
    expect(pipModel.modelReview?.status).toBe('PENDING');
    expect(pipModel.inspection.productionReadyEligible).toBe(false);

    const goatModel = await characterOnboardingService.uploadModel({
      characterId: goat.id,
      universeId: universe.id,
      fileName: 'goat_production.blend',
      bytes: fakeBlend('goat'),
    });
    expect(goatModel.status).toBe('CANDIDATE / BLOCKED');
    expect(goatModel.model.productionReady).toBe(false);

    const pipReady = await canonicalCharacterService.readinessMatrix(FOUNDING_CODES.PIP);
    expect(pipReady.primaryReference).toBe('READY');
    expect(pipReady.productionModel).toContain('CANDIDATE');
    expect(pipReady.rig).toBe('BLOCKED');
    expect(pipReady.facialRig).toBe('BLOCKED');
    expect(pipReady.lipSync).toBe('BLOCKED');
    expect(pipReady.final1080pCharacterValidation).toBe('BLOCKED');
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);
  });

  it('persists render/manifest artifacts through production storage', async () => {
    const stored = await productionStorageService.storeUpload({
      category: 'final-renders',
      parts: ['episode', 'final', Date.now(), 'probe.mp4'],
      bytes: new TextEncoder().encode('fake-mp4-bytes'),
      contentType: 'video/mp4',
      originalName: 'probe.mp4',
    });
    expect(stored.storageKey.startsWith('final-renders/')).toBe(true);
    expect(stored.checksum).toHaveLength(64);

    const manifest = await productionManifestService.lock(VERTICAL_SLICE_EPISODE_ID, 'DRAFT');
    expect(manifest.storageKey).toBeTruthy();
    expect(String(manifest.storageKey).startsWith('manifests/')).toBe(true);

    const health = await durableStorageOpsService.health();
    expect(health.provider).toBeTruthy();
    expect(health.prefixes?.includes('character-models/')).toBe(true);

    const selfTest = await durableStorageOpsService.selfTest();
    expect(selfTest.ok).toBe(true);
  });
});
