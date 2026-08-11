import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { studioSettingsService } from '@doodle-dash/characters';
import { productionSetupService } from '@doodle-dash/production';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

describe('production setup wizard', () => {
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

  it('builds ordered setup checklist with a single primary action', async () => {
    const checklist = await productionSetupService.buildChecklist();
    expect(checklist.steps).toHaveLength(14);
    expect(checklist.steps[0]?.id).toBe('durable-storage');
    expect(checklist.steps.map((s) => s.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(checklist.primaryAction.label.length).toBeGreaterThan(0);
    expect(checklist.primaryAction.href.length).toBeGreaterThan(0);
    expect(checklist.philosophy).toMatch(/Blender-first/);
    expect(await studioSettingsService.isStrictCharacterLockEnabled()).toBe(true);
  });

  it('exports Pip/Goat modeling packages that are not .blend claims', async () => {
    const pip = productionSetupService.buildModelingPackage(FOUNDING_CODES.PIP);
    const goat = productionSetupService.buildModelingPackage(FOUNDING_CODES.GOAT);
    expect(pip.notABlendFile).toBe(true);
    expect(goat.notABlendFile).toBe(true);
    expect(pip.facialRequirements).toContain('jaw_open');
    expect(pip.visemeRequirements).toContain('REST');
    expect(goat.forbiddenDrift.length).toBeGreaterThan(0);
    expect(pip.acceptanceChecklist.some((c) => c.toLowerCase().includes('manual approval'))).toBe(
      true,
    );

    const exported = await productionSetupService.exportModelingPackage(FOUNDING_CODES.PIP);
    expect(exported.json.storageKey.startsWith('reports/')).toBe(true);
    expect(exported.markdown.storageKey.startsWith('reports/')).toBe(true);
    expect(exported.package.disclaimer).toMatch(/NOT a \.blend/i);
  });

  it('exposes blender readiness panel fields without fabricating success', async () => {
    const panel = await productionSetupService.blenderPanel();
    expect(typeof panel.blenderInstalled).toBe('boolean');
    expect(typeof panel.eeveeAvailable).toBe('boolean');
    expect(typeof panel.ffmpegAvailable).toBe('boolean');
    expect(typeof panel.storageConnected).toBe('boolean');
    // Without a successful self-test recorded, do not claim READY fabrications
    if (!panel.blenderInstalled) {
      expect(panel.selfTestOk).toBe(false);
    }
  });
});
