import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES, DEFAULT_PRODUCTION_MODE } from '@doodle-dash/domain';
import {
  assignProductionPlan,
  doodleGuardian,
  productionDirectorService,
  searchService,
  backupExportService,
} from '@doodle-dash/production';
import {
  seasonService,
  episodeService,
  contextRetrievalService,
  cameraDirectorService,
  nextEpisodeOrchestrator,
  checkCameraRules,
} from '@doodle-dash/story';
import { renderJobService, InMemoryRenderQueue } from '@doodle-dash/rendering';
import { FfmpegPipeline, safeShellArg, assertSafePath } from '@doodle-dash/shared';
import { SoraProviderStub } from '@doodle-dash/providers';
import { CaptionService } from '@doodle-dash/audio';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');

describe('Studio complete milestones 6+', () => {
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

  it('seeds locations, props, style bible, season scaffold', async () => {
    const locations = await prisma.location.count();
    const props = await prisma.prop.count();
    const seasons = await prisma.season.count();
    const style = await prisma.styleBible.count();
    expect(locations).toBeGreaterThanOrEqual(2);
    expect(props).toBeGreaterThanOrEqual(1);
    expect(seasons).toBeGreaterThanOrEqual(1);
    expect(style).toBeGreaterThanOrEqual(1);
  });

  it('builds relevant universe context without dumping the whole database', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const context = await contextRetrievalService.buildRelevantUniverseContext({
      universeId: universe.id,
      characterIds: [],
      limit: 20,
    });
    expect(context.meta.relevantOnly).toBe(true);
    expect(context.characters.length).toBeGreaterThanOrEqual(2);
  });

  it('requires season approval before production', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const seasons = (await seasonService.list(universe.id)) as Array<{
      id: string;
      approvedForProduction: boolean;
    }>;
    const season = seasons[0]!;
    await expect(seasonService.assertApprovedForProduction(season.id)).rejects.toMatchObject({
      code: 'SEASON_APPROVAL_REQUIRED',
    });
  });

  it('creates episodes and next-episode proposals for Pip/Goat', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const season = (await seasonService.list(universe.id))[0] as { id: string };
    await episodeService.create({
      universeId: universe.id,
      seasonId: season.id,
      episodeNumber: 1,
      title: 'The Meadow Map',
      logline: 'Pip and Goat find a map and take a careful first step.',
      synopsis: 'A gentle adventure about asking for help.',
      status: 'DRAFT',
    });
    const proposal = await nextEpisodeOrchestrator.createNextEpisodeProposal({
      universeId: universe.id,
      seasonId: season.id,
    });
    expect(proposal).toBeTruthy();
  });

  it('plans production modes and blocks unsafe shell args', () => {
    const plan = assignProductionPlan(
      {
        description: 'Hero reveal',
        durationSeconds: 4,
        isHeroMoment: true,
        storyImportance: 90,
        hasApproved3dAssets: false,
      },
      DEFAULT_PRODUCTION_MODE,
    );
    expect(plan.cinematicImportance).toBeGreaterThan(50);
    expect(productionDirectorService.defaultMode).toBe(DEFAULT_PRODUCTION_MODE);
    expect(() => safeShellArg('ok-file.mp4')).not.toThrow();
    expect(() => assertSafePath('bad;rm -rf')).toThrow();
    expect(() => assertSafePath('/tmp/out.mp4')).not.toThrow();
  });

  it('creates persistent render jobs and queue claims', async () => {
    const job = await renderJobService.create({
      priority: 70,
      resolution: '540x960',
      fps: 30,
      engine: 'EEVEE',
      payload: {
        sceneId: 'scene-demo',
        assets: [],
        metadata: {},
      },
    });
    expect(job.status).toBe('QUEUED');
    const queue = new InMemoryRenderQueue();
    await queue.enqueue({
      priority: 10,
      resolution: '270x480',
      fps: 30,
      engine: 'EEVEE',
      payload: { sceneId: 'q1', assets: [], metadata: {} },
    });
    const claimed = await queue.claim('worker-test');
    expect(claimed?.lockedBy).toBe('worker-test');
  });

  it('keeps AI video providers optional and reference-aware for Sora', async () => {
    const sora = new SoraProviderStub();
    expect(sora.supportsReferenceImages()).toBe(true);
    const caps = await sora.getCapabilities();
    expect(caps).toBeTruthy();
  });

  it('builds ffmpeg argv arrays and SRT captions safely', () => {
    const pipeline = new FfmpegPipeline();
    const command = pipeline.concat('/tmp/list.txt', '/tmp/out.mp4');
    expect(command.executable).toBe('ffmpeg');
    expect(command.argv[0]).toBe('-f');
    const srt = CaptionService.toSrt([
      { startMs: 0, endMs: 1000, text: 'Hello' },
    ]);
    expect(srt).toContain('Hello');
  });

  it('scores continuity with Doodle Guardian threshold 92', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const canonFacts = await prisma.canonFact.findMany({ where: { universeId: universe.id } });
    const report = doodleGuardian.score({
      text: 'Pip is a founding character of the Doodle Dash Universe.',
      canonFacts,
    });
    expect(report.threshold).toBe(92);
    expect(report.score).toBeGreaterThan(0);
  });

  it('searches and exports universe backup JSON', async () => {
    const universe = await prisma.universe.findFirstOrThrow();
    const results = await searchService.search({ universeId: universe.id, query: 'Pip' });
    expect(results.characters.some((c) => c.internalCode === FOUNDING_CODES.PIP)).toBe(true);
    const backup = await backupExportService.exportUniverseSnapshot(universe.id);
    expect(backup).toBeTruthy();
  });

  it('camera director exposes presets and rule checks', () => {
    const presets = cameraDirectorService.listPresets();
    expect(presets.length).toBeGreaterThan(0);
    const issues = checkCameraRules({
      presetCode: 'close_up',
      consecutiveCloseUps: 5,
      durationSeconds: 1,
    });
    expect(Array.isArray(issues)).toBe(true);
  });
});
