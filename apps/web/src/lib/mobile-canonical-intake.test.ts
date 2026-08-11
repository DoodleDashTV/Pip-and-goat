import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { studioSettingsService } from '@doodle-dash/characters';
import { canonicalCharacterService, productionStorageService } from '@doodle-dash/production';
import {
  AppError,
  createDefaultObjectStorage,
  describeObjectStorageStatus,
  parseLocalStorageKey,
} from '@doodle-dash/shared';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

function fakeImage(tag: string, ext: 'jpg' | 'png' | 'webp') {
  const body = new TextEncoder().encode(`mobile-intake-${tag}-${Date.now()}-${ext}`);
  if (ext === 'png') {
    // Minimal PNG signature + payload (not a full PNG decode, enough for binary persistence tests)
    const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const out = new Uint8Array(sig.length + body.length);
    out.set(sig, 0);
    out.set(body, sig.length);
    return out;
  }
  if (ext === 'webp') {
    const sig = new TextEncoder().encode('RIFF....WEBP');
    const out = new Uint8Array(sig.length + body.length);
    out.set(sig, 0);
    out.set(body, sig.length);
    return out;
  }
  const prefix = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const out = new Uint8Array(prefix.length + body.length + 2);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xd9;
  return out;
}

describe('mobile canonical reference intake', () => {
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

  it('reports local storage as non-durable for Cloud Agent / redeploy safety', () => {
    const status = describeObjectStorageStatus();
    expect(status.provider).toBe('local');
    expect(status.durable).toBe(false);
    expect(status.banner).toBe('DURABLE STORAGE NOT CONFIGURED');
    expect(status.requiredConfig.some((line) => line.includes('OBJECT_STORAGE_PROVIDER=s3'))).toBe(
      true,
    );
  });

  it('accepts JPEG and PNG primary uploads with SHA-256 + pending approval', async () => {
    await canonicalCharacterService.bootstrapFoundingCharacters();
    const jpeg = await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.PIP,
      fileName: 'pip_primary_reference.jpeg',
      bytes: fakeImage('pip-jpeg', 'jpg'),
      contentType: 'image/jpeg',
    });
    expect(jpeg.checksum).toHaveLength(64);
    expect(jpeg.referenceImage.reviewStatus).toBe('PENDING_REVIEW');
    expect(jpeg.referenceImage.assetId).toBeTruthy();
    expect(jpeg.readiness.primaryReference).toContain('BLOCKED');
    expect(jpeg.readiness.productionModel).toBe('BLOCKED — REAL .BLEND REQUIRED');
    expect(jpeg.readiness.rig).toBe('BLOCKED');
    expect(jpeg.readiness.facialRig).toBe('BLOCKED');
    expect(jpeg.readiness.lipSync).toBe('BLOCKED');
    expect(jpeg.readiness.final1080pCharacterValidation).toBe('BLOCKED');

    const png = await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.GOAT,
      fileName: 'goat_primary_reference.png',
      bytes: fakeImage('goat-png', 'png'),
      contentType: 'image/png',
    });
    expect(png.checksum).toHaveLength(64);
    expect(png.referenceImage.assetId).toBeTruthy();
    expect(png.readiness.productionModel).toBe('BLOCKED — REAL .BLEND REQUIRED');
  });

  it('persists actual binary bytes through the storage abstraction', async () => {
    const bytes = fakeImage('persist', 'jpg');
    const stored = await productionStorageService.storeUpload({
      category: 'original_uploads',
      parts: ['test', 'mobile-persist', Date.now(), 'probe.jpeg'],
      bytes,
      contentType: 'image/jpeg',
      originalName: 'probe.jpeg',
    });
    expect(stored.checksum).toHaveLength(64);
    expect(stored.uri.startsWith('local://')).toBe(true);
    const key = parseLocalStorageKey(stored.uri);
    expect(key).toBeTruthy();
    const storage = createDefaultObjectStorage();
    const readBack = await storage.readObject!(key!);
    expect(Buffer.from(readBack).equals(Buffer.from(bytes))).toBe(true);
  });

  it('rejects unsupported formats and keeps Pip/Goat associations unique', async () => {
    await expect(
      canonicalCharacterService.ingestPrimaryCanonicalReference({
        characterCode: FOUNDING_CODES.PIP,
        fileName: 'pip_primary_reference.gif',
        bytes: fakeImage('bad', 'jpg'),
        contentType: 'image/gif',
      }),
    ).rejects.toBeInstanceOf(AppError);

    const pips = await prisma.character.findMany({ where: { internalCode: FOUNDING_CODES.PIP } });
    const goats = await prisma.character.findMany({ where: { internalCode: FOUNDING_CODES.GOAT } });
    expect(pips).toHaveLength(1);
    expect(goats).toHaveLength(1);
  });

  it('approves immutable lock, allows replace candidate, keeps model gates blocked', async () => {
    const first = await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.PIP,
      fileName: 'pip_primary_reference.jpeg',
      bytes: fakeImage('pip-approve', 'jpg'),
      contentType: 'image/jpeg',
    });
    const approved = await canonicalCharacterService.approvePrimaryCanonical({
      characterCode: FOUNDING_CODES.PIP,
      referenceImageId: first.referenceImage.id,
      approvedBy: 'tester',
    });
    expect(approved.immutable).toBe(true);
    expect(approved.versionNumber).toBeGreaterThanOrEqual(1);

    await expect(
      canonicalCharacterService.rejectPrimaryCandidate({
        characterCode: FOUNDING_CODES.PIP,
        referenceImageId: first.referenceImage.id,
        rejectedBy: 'tester',
      }),
    ).rejects.toMatchObject({ code: 'IMMUTABLE_REFERENCE' });

    const replacement = await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.PIP,
      fileName: 'pip_primary_reference_v2.jpeg',
      bytes: fakeImage('pip-replace', 'jpg'),
      contentType: 'image/jpeg',
    });
    expect(replacement.referenceImage.reviewStatus).toBe('PENDING_REVIEW');
    const rejected = await canonicalCharacterService.rejectPrimaryCandidate({
      characterCode: FOUNDING_CODES.PIP,
      referenceImageId: replacement.referenceImage.id,
      rejectedBy: 'tester',
      reason: 'wrong crop',
    });
    expect(rejected.reviewStatus).toBe('REJECTED');

    const ready = await canonicalCharacterService.readinessMatrix(FOUNDING_CODES.PIP);
    expect(ready.canon).toBe('READY');
    expect(ready.dna).toBe('READY');
    expect(ready.primaryReference).toBe('READY');
    expect(ready.productionModel).toBe('BLOCKED — REAL .BLEND REQUIRED');
    expect(ready.rig).toBe('BLOCKED');
    expect(ready.facialRig).toBe('BLOCKED');
    expect(ready.lipSync).toBe('BLOCKED');
    expect(ready.final1080pCharacterValidation).toBe('BLOCKED');
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);
  });

  it('associates Goat candidate and keeps STRICT_CHARACTER_LOCK on', async () => {
    const goat = await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: FOUNDING_CODES.GOAT,
      fileName: 'goat_primary_reference.jpeg',
      bytes: fakeImage('goat-assoc', 'jpg'),
      contentType: 'image/jpeg',
      autoApprove: true,
      approvedBy: 'tester',
    });
    expect(goat.referenceImage.characterId).toBe('33333333-3333-4333-8333-333333333333');
    expect(goat.readiness.primaryReference).toBe('READY');
    expect(goat.readiness.productionModel).toContain('BLOCKED');
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);
  });
});
