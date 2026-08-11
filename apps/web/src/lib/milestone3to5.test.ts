import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import {
  characterDevelopmentService,
  characterDnaService,
  characterService,
  relationshipService,
  studioSettingsService,
} from '@doodle-dash/characters';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

describe('Milestone 3-5 character continuity', () => {
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

  it('keeps STRICT_CHARACTER_LOCK enabled by default', async () => {
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);
  });

  it('allows DNA updates through validated schemas', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    const personality = await characterDnaService.updatePersonality(pip.id, {
      curiosity: 92,
      notes: 'Slight polish for baseline curiosity.',
    });
    expect(personality.curiosity).toBe(92);
  });

  it('seeds development baselines for Pip and Goat', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    const goat = await characterService.getByCode(FOUNDING_CODES.GOAT);
    const pipDev = await characterDevelopmentService.get(pip.id);
    const goatDev = await characterDevelopmentService.get(goat.id);
    expect(pipDev?.curiosity).toBe(90);
    expect(goatDev?.empathy).toBe(75);
  });

  it('requires story event refs for development changes', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    await expect(
      characterDevelopmentService.applyEvent({
        characterId: pip.id,
        attribute: 'courage',
        newValue: 70,
        storyEventRef: '',
        approved: false,
      }),
    ).rejects.toBeTruthy();
  });

  it('applies development events and records history', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    const result = await characterDevelopmentService.applyEvent({
      characterId: pip.id,
      attribute: 'courage',
      newValue: 68,
      storyEventRef: 'TEST_STORY_EVENT_COURAGE',
      summary: 'Test-only courage bump',
      approved: true,
    });
    expect(result.development.courage).toBe(68);
    expect(result.event.delta).toBe(8);
    const events = await characterDevelopmentService.listEvents(pip.id);
    expect(events.some((event) => event.storyEventRef === 'TEST_STORY_EVENT_COURAGE')).toBe(true);
  });

  it('seeds bidirectional Pip↔Goat relationships with neutral defaults', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    const goat = await characterService.getByCode(FOUNDING_CODES.GOAT);
    const forward = await relationshipService.getPair(pip.id, goat.id);
    const reverse = await relationshipService.getPair(goat.id, pip.id);
    expect(forward?.friendship).toBe(75);
    expect(reverse?.trust).toBe(70);
    expect(forward?.rivalry).toBeLessThan(20);
  });

  it('requires story event refs for relationship changes', async () => {
    const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
    const goat = await characterService.getByCode(FOUNDING_CODES.GOAT);
    const relationship = await relationshipService.getPair(pip.id, goat.id);
    expect(relationship).toBeTruthy();
    await expect(
      relationshipService.applyEvent({
        relationshipId: relationship!.id,
        attribute: 'trust',
        newValue: 80,
        storyEventRef: '   ',
        approved: false,
      }),
    ).rejects.toBeTruthy();
  });

  it('applies relationship events without inventing extreme story details', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const relationships = await relationshipService.listByUniverse(universe.id);
    expect(relationships.length).toBe(2);
    const target = relationships[0]!;
    const result = await relationshipService.applyEvent({
      relationshipId: target.id,
      attribute: 'familiarity',
      newValue: 82,
      storyEventRef: 'TEST_STORY_EVENT_FAMILIARITY',
      summary: 'Mild familiarity bump for tests',
      approved: true,
    });
    expect(result.relationship.familiarity).toBe(82);
  });
});
