import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { studioSettingsService } from '@doodle-dash/characters';
import {
  PIP_CANONICAL_DNA,
  GOAT_CANONICAL_DNA,
  SHARED_VISUAL_STYLE_LOCK,
  VERTICAL_SLICE_EPISODE_ID,
  accessoryContinuityGuardian,
  canonicalCharacterService,
  characterAssetValidator,
  productionManifestService,
  referenceLockService,
  shotRenderCacheService,
} from '@doodle-dash/production';
import { AppError } from '@doodle-dash/shared';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

/** Minimal JPEG-like bytes for hashing/ingestion tests — not a real character image. */
function fakeJpeg(tag: string) {
  const prefix = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const body = new TextEncoder().encode(`test-canonical-${tag}-${Date.now()}`);
  const out = new Uint8Array(prefix.length + body.length + 2);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xd9;
  return out;
}

describe('Pip + Goat canonical character lock', () => {
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

  it('keeps founding canonical IDs and does not duplicate characters', async () => {
    const pip = await prisma.character.findMany({ where: { internalCode: FOUNDING_CODES.PIP } });
    const goat = await prisma.character.findMany({ where: { internalCode: FOUNDING_CODES.GOAT } });
    expect(pip).toHaveLength(1);
    expect(goat).toHaveLength(1);
    expect(pip[0]!.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(goat[0]!.id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('locks Pip and Goat visual DNA without marking models ready', async () => {
    const boot = await canonicalCharacterService.bootstrapFoundingCharacters();
    expect(boot.styleLock.style).toContain('stylized 3D');
    expect(SHARED_VISUAL_STYLE_LOCK.finalDelivery).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 30,
      engine: 'EEVEE',
    });

    const pipReady = await canonicalCharacterService.readinessMatrix(FOUNDING_CODES.PIP);
    const goatReady = await canonicalCharacterService.readinessMatrix(FOUNDING_CODES.GOAT);
    expect(pipReady.canonicalId).toBe('READY');
    expect(pipReady.dna).toBe('READY');
    expect(pipReady.productionModel).toContain('BLOCKED');
    expect(pipReady.rig).toBe('BLOCKED');
    expect(pipReady.facialRig).toBe('BLOCKED');
    expect(pipReady.lipSync).toBe('BLOCKED');
    expect(pipReady.final1080pCharacterValidation).toBe('BLOCKED');
    expect(pipReady.productionReadyFlag).toBe(false);
    expect(goatReady.productionModel).toContain('BLOCKED');
    expect(goatReady.productionReadyFlag).toBe(false);

    expect(PIP_CANONICAL_DNA.accessories.backpack.code).toBe('PIP_PURPLE_BACKPACK');
    expect(GOAT_CANONICAL_DNA.accessories.collar.description).toContain('GOAT');
  });

  it('ingests primary canonical reference with hash + versioning; never falsifies production-ready', async () => {
    const pipBytes = fakeJpeg('pip');
    const pip = await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.PIP,
      fileName: 'pip-primary-canonical.jpg',
      bytes: pipBytes,
      autoApprove: true,
      approvedBy: 'tester',
    });
    expect(pip.checksum).toHaveLength(64);
    expect(pip.readiness.productionModel).toContain('BLOCKED');
    expect(pip.readiness.primaryReference).toBe('READY');
    expect(pip.approval?.immutable).toBe(true);
    expect(pip.approval?.versionNumber).toBeGreaterThanOrEqual(1);

    const pipModel = await prisma.character3dModel.findFirstOrThrow({
      where: { characterId: '22222222-2222-4222-8222-222222222222' },
    });
    expect(pipModel.productionReady).toBe(false);
    expect(pipModel.status).toBe('MISSING');

    // Second upload creates a new candidate; approving creates a new immutable version.
    const pip2 = await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.PIP,
      fileName: 'pip-primary-canonical-v2-candidate.jpg',
      bytes: fakeJpeg('pip-v2'),
      autoApprove: true,
      approvedBy: 'tester',
    });
    expect(pip2.approval!.versionNumber).toBeGreaterThan(pip.approval!.versionNumber);

    const goat = await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.GOAT,
      fileName: 'goat-primary-canonical.jpg',
      bytes: fakeJpeg('goat'),
      autoApprove: true,
      approvedBy: 'tester',
    });
    expect(goat.readiness.primaryReference).toBe('READY');
    expect(goat.readiness.productionModel).toContain('BLOCKED');
  });

  it('enforces Pip/Goat locked traits and accessory defaults', async () => {
    const pipPkg = await prisma.characterCanonicalPackage.findFirstOrThrow({
      where: { characterCode: FOUNDING_CODES.PIP },
    });
    const goatPkg = await prisma.characterCanonicalPackage.findFirstOrThrow({
      where: { characterCode: FOUNDING_CODES.GOAT },
    });
    expect(JSON.stringify(pipPkg.lockedTraits)).toContain('golden');
    expect(JSON.stringify(pipPkg.accessoryCanon)).toContain('PIP_PURPLE_BACKPACK');
    expect(JSON.stringify(goatPkg.lockedTraits)).toContain('horn');
    expect(JSON.stringify(goatPkg.accessoryCanon)).toContain('GOAT_BLUE_COLLAR_TAG');

    expect(canonicalCharacterService.defaultAccessoryState(FOUNDING_CODES.PIP)).toMatchObject({
      backpack: 'PRESENT',
      starCharm: 'PRESENT',
    });
    expect(canonicalCharacterService.defaultAccessoryState(FOUNDING_CODES.GOAT)).toMatchObject({
      collar: 'PRESENT',
      goatTag: 'PRESENT',
      tagText: 'GOAT',
    });
  });

  it('gates missing model/rig/facial/viseme and keeps STRICT_CHARACTER_LOCK', async () => {
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    const report = await characterAssetValidator.validate(pip.id);
    expect(report.passed).toBe(false);
    const codes = report.checks.map((c) => c.code);
    expect(codes).toContain('MODEL_EXISTS');
    expect(codes).toContain('RIG_EXISTS');
    expect(codes).toContain('FACIAL_RIG_EXISTS');
    expect(codes).toContain('LIP_SYNC_CAPABILITY');
    expect(codes).toContain('FINAL_1080P_CHARACTER_VALIDATION');
    expect(report.checks.find((c) => c.code === 'MODEL_EXISTS')?.passed).toBe(false);
  });

  it('records production manifest identity + accessory state', async () => {
    const manifest = await productionManifestService.lock(VERTICAL_SLICE_EPISODE_ID, 'DRAFT');
    const body = manifest.manifest as {
      characters: Array<{ code: string; dnaVersion: number | null; accessoryState: object }>;
      pipVersion: { code: string };
      goatVersion: { code: string };
    };
    expect(body.pipVersion.code).toBe('CHAR_PIP_001');
    expect(body.goatVersion.code).toBe('CHAR_GOAT_001');
    expect(body.characters.find((c) => c.code === 'CHAR_PIP_001')?.accessoryState).toMatchObject({
      backpack: 'PRESENT',
    });
  });

  it('invalidates shot cache when character DNA/reference fingerprint inputs change', async () => {
    const shot = await prisma.shot.findFirstOrThrow({
      where: { scene: { episodeId: VERTICAL_SLICE_EPISODE_ID } },
      orderBy: { shotNumber: 'asc' },
    });
    // Ensure Pip is on the shot for fingerprint character package inclusion.
    await prisma.shot.update({
      where: { id: shot.id },
      data: { characterIds: ['22222222-2222-4222-8222-222222222222'] },
    });
    const first = await shotRenderCacheService.lookupOrMark({
      shotId: shot.id,
      profileCode: 'FINAL_1080P',
      engine: 'EEVEE',
    });
    await shotRenderCacheService.markApproved(first.entry!.id, 'local://cache/pip-shot.mp4');
    const reuse = await shotRenderCacheService.lookupOrMark({
      shotId: shot.id,
      profileCode: 'FINAL_1080P',
      engine: 'EEVEE',
    });
    expect(reuse.reusable).toBe(true);

    await prisma.characterCanonicalPackage.update({
      where: { characterId: '22222222-2222-4222-8222-222222222222' },
      data: { dnaVersion: 2 },
    });
    const invalidated = await shotRenderCacheService.lookupOrMark({
      shotId: shot.id,
      profileCode: 'FINAL_1080P',
      engine: 'EEVEE',
    });
    expect(invalidated.reusable).toBe(false);
    expect(invalidated.fingerprint).not.toBe(first.fingerprint);
  });

  it('FAIL CLOSED on AI reference conditioning / text-only character generation', async () => {
    await expect(
      referenceLockService.assertReferenceConditioning({
        characterId: '22222222-2222-4222-8222-222222222222',
        providerSupportsReferenceImages: false,
      }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      referenceLockService.assertReferenceConditioning({
        characterId: '22222222-2222-4222-8222-222222222222',
        providerSupportsReferenceImages: true,
        referenceConditioningSucceeded: false,
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_CONDITIONING_FAILED' });

    expect(() => canonicalCharacterService.assertNotTextOnlyCharacterGeneration()).toThrowError(
      /text alone/i,
    );
  });

  it('flags accessory continuity changes between adjacent Pip/Goat shots', async () => {
    const shots = await prisma.shot.findMany({
      where: { scene: { episodeId: VERTICAL_SLICE_EPISODE_ID } },
      orderBy: { shotNumber: 'asc' },
      take: 2,
    });
    expect(shots.length).toBeGreaterThanOrEqual(2);
    await prisma.shot.update({
      where: { id: shots[0]!.id },
      data: { characterIds: ['22222222-2222-4222-8222-222222222222'] },
    });
    await prisma.shot.update({
      where: { id: shots[1]!.id },
      data: { characterIds: ['22222222-2222-4222-8222-222222222222'] },
    });
    await canonicalCharacterService.setShotAccessoryState({
      shotId: shots[0]!.id,
      characterId: '22222222-2222-4222-8222-222222222222',
      accessories: { backpack: 'PRESENT', starCharm: 'PRESENT' },
    });
    await canonicalCharacterService.setShotAccessoryState({
      shotId: shots[1]!.id,
      characterId: '22222222-2222-4222-8222-222222222222',
      accessories: { backpack: 'ABSENT', starCharm: 'ABSENT' },
    });
    const report = await accessoryContinuityGuardian.evaluateEpisode(VERTICAL_SLICE_EPISODE_ID);
    expect(report.passed).toBe(false);
    expect(report.warnings.some((w) => w.message.includes('CHAR_PIP_001'))).toBe(true);
  });
});
