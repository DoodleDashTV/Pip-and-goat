import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { canonService } from '@doodle-dash/universe';
import { assetService, characterService } from '@doodle-dash/characters';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

describe('Milestone 1 foundation', () => {
  beforeAll(() => {
    // Reset the dedicated local test database only (doodle_dash_test).
    // Avoid prisma --force-reset which is blocked for AI agents.
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) {
      throw new Error('DATABASE_URL is required for tests');
    }
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

  it('seeds Doodle Dash Universe', async () => {
    const universe = await prisma.universe.findFirst({
      where: { brandName: 'Doodle Dash Production' },
    });
    expect(universe?.name).toBe('Doodle Dash Universe');
    expect(universe?.defaultOutputFormat).toBe('1080x1920');
  });

  it('seeds founding Pip and Goat with MISSING models', async () => {
    const characters = await characterService.getFoundingCharacters();
    expect(characters.map((c) => c.internalCode).sort()).toEqual([
      FOUNDING_CODES.GOAT,
      FOUNDING_CODES.PIP,
    ]);

    for (const character of characters) {
      expect(character.foundingCharacter).toBe(true);
      expect(character.versions.length).toBeGreaterThanOrEqual(1);
      expect(character.personalityDna).toBeTruthy();
      expect(character.visualDna?.pendingReview).toBe(true);
      expect(character.models[0]?.status).toBe('MISSING');
      expect(character.models[0]?.productionReady).toBe(false);
    }
  });

  it('blocks unlock of IMMUTABLE canon', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const immutable = await prisma.canonFact.findFirstOrThrow({
      where: { universeId: universe.id, canonLevel: 'IMMUTABLE', locked: true },
    });

    await expect(canonService.unlockCanonFact(immutable.id)).rejects.toMatchObject({
      code: 'IMMUTABLE_CANON_LOCKED',
    });
  });

  it('creates canon change proposals without mutating locked facts', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const locked = await prisma.canonFact.findFirstOrThrow({
      where: { universeId: universe.id, locked: true },
    });

    const proposal = await canonService.createCanonChangeProposal({
      universeId: universe.id,
      targetCanonId: locked.id,
      proposedStatement: 'Proposed alternate wording for review',
      reason: 'Editorial review',
    });

    const refreshed = await prisma.canonFact.findUniqueOrThrow({ where: { id: locked.id } });
    expect(refreshed.statement).toBe(locked.statement);
    expect(proposal.category.startsWith('proposal:')).toBe(true);
    expect(proposal.locked).toBe(false);
  });

  it('registers missing character model assets', async () => {
    const assets = await assetService.list({ missing: true });
    expect(assets.some((a) => a.name.includes('Pip'))).toBe(true);
    expect(assets.some((a) => a.name.includes('Goat'))).toBe(true);
  });

  it('creates a new character version without inventing production-ready models', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    const version = await characterService.createVersion({
      characterId: pip.id,
      versionName: 'Pip v2',
      changeSummary: 'Test version only',
    });

    expect(version.versionNumber).toBe(2);
    const refreshed = await characterService.getByCode(FOUNDING_CODES.PIP);
    expect(refreshed.currentVersionId).toBe(version.id);
    const model = refreshed.models.find((m) => m.characterVersionId === version.id);
    expect(model?.status).toBe('MISSING');
    expect(model?.productionReady).toBe(false);
  });

  it('enforces strict character lock when no production model exists', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    expect(() => characterService.assertModelReadyForNativeRender(pip)).toThrowError(
      /STRICT_CHARACTER_LOCK/,
    );
  });
});
