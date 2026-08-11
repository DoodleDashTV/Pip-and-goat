import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES, MODEL_STATUS_FLOW, REQUIRED_VISEMES } from '@doodle-dash/domain';
import {
  animationLibraryService,
  characterModelService,
  characterPreflightService,
  characterService,
  expressionLibraryService,
  poseLibraryService,
  referenceImageService,
  visemeLibraryService,
} from '@doodle-dash/characters';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

describe('Milestone 2 character production', () => {
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
  }, 120_000);

  it('seeds body/facial rigs as MISSING and not approved', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    expect(pip.rigs[0]?.status).toBe('MISSING');
    expect(pip.rigs[0]?.approved).toBe(false);
    expect(pip.facialRigs[0]?.status).toBe('MISSING');
    expect(pip.facialRigs[0]?.approved).toBe(false);
    expect(pip.models[0]?.status).toBe('MISSING');
    expect(pip.models[0]?.productionReady).toBe(false);
  });

  it('seeds animation, pose, expression, and viseme definitions without faking assets', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const animations = await animationLibraryService.list(universe.id);
    const poses = await poseLibraryService.list(universe.id);
    const expressions = await expressionLibraryService.list(universe.id);
    const visemes = await visemeLibraryService.list();

    expect(animations.length).toBeGreaterThanOrEqual(19);
    expect(poses.some((pose) => pose.code === 'standing_neutral')).toBe(true);
    expect(expressions.some((expression) => expression.code === 'curious')).toBe(true);
    expect(visemes.map((v) => v.code).sort()).toEqual([...REQUIRED_VISEMES].sort());
    expect(animations.every((animation) => animation.status === 'MISSING')).toBe(true);
    expect(poses.every((pose) => pose.status === 'MISSING')).toBe(true);
  });

  it('keeps reference slots in pending review', async () => {
    const goat = await characterService.getByCode(FOUNDING_CODES.GOAT);
    const refs = await referenceImageService.listByCharacter(goat.id);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((ref) => ref.reviewStatus === 'PENDING_REVIEW')).toBe(true);
  });

  it('blocks PRODUCTION_READY without real assets', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    const model = pip.models[0];
    expect(model).toBeTruthy();
    await expect(
      characterModelService.updateStatus(model!.id, 'PRODUCTION_READY'),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_PRODUCTION_READY' });
  });

  it('blocks native render under STRICT_CHARACTER_LOCK when assets are missing', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    const preflight = await characterPreflightService.runForCharacter(pip.id);
    expect(preflight.strictCharacterLock).toBe(true);
    expect(preflight.blocked).toBe(true);
    expect(preflight.issues.some((issue) => issue.code === 'CHARACTER_MODEL_MISSING')).toBe(true);
    await expect(
      characterPreflightService.assertNativeRenderAllowed(pip.id),
    ).rejects.toMatchObject({ code: 'CHARACTER_LOCK_BLOCKED' });
  });

  it('exposes the official model status flow', () => {
    expect(characterModelService.getStatusFlow()).toEqual([...MODEL_STATUS_FLOW]);
  });
});
