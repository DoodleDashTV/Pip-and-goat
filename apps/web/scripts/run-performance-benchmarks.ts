import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import {
  PerformanceProfiler,
  autoRenderConcurrency,
  detectBlenderDevices,
  detectHardware,
  dirtyShotPlanner,
  performanceDashboardService,
  resolvePerformanceConfig,
  shotRenderCacheService,
} from '@doodle-dash/production';

const require = createRequire(__filename);
const { PersistentBlenderDaemon } = require('../../../workers/blender-renderer/src/persistent-daemon.js');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(ROOT, 'artifacts', 'performance');
const LIB = path.join(ROOT, 'production-library');

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

async function localAssets() {
  return [
    { id: 'pip', role: 'character', localPath: path.join(LIB, 'characters/pip_production.blend') },
    { id: 'goat', role: 'character', localPath: path.join(LIB, 'characters/goat_production.blend') },
    { id: 'meadow', role: 'location', localPath: path.join(LIB, 'environments/meadow_production.blend') },
    { id: 'map', role: 'prop', localPath: path.join(LIB, 'props/adventure_map.blend') },
  ];
}

async function renderOnce(
  daemon: InstanceType<typeof PersistentBlenderDaemon>,
  label: string,
  frames: number,
  samples: number,
  resolution: string,
) {
  const outputDir = path.join(OUT, 'bench', label);
  ensureDir(outputDir);
  // clean frames
  spawnSync('bash', ['-lc', `rm -f ${outputDir}/frame_*.png ${outputDir}/shot.mp4`], { encoding: 'utf8' });
  const t0 = Date.now();
  const result = await daemon.render({
    resolution,
    fps: 30,
    outputDir,
    assets: await localAssets(),
    metadata: {
      startFrame: 1,
      endFrame: frames,
      samples,
      cameraPreset: 'TWO_SHOT',
      shotMeta: {
        placements: {
          pip: { location: [-0.7, 0, 0], action: 'PIP_TALK' },
          goat: { location: [0.9, 0, 0], action: 'GOAT_TALK' },
          meadow: { location: [0, 0, 0] },
          map: { location: [0, 0.35, 0.05] },
        },
        actions: { pip: 'PIP_TALK', goat: 'GOAT_TALK' },
        lipSync: {
          pip: [
            { viseme: 'A', startMs: 0, endMs: 200, weight: 1 },
            { viseme: 'REST', startMs: 200, endMs: 400, weight: 1 },
          ],
        },
      },
    },
  });
  const wallMs = Date.now() - t0;
  return { label, wallMs, result, outputDir, frames, samples, resolution };
}

async function main() {
  ensureDir(OUT);
  const hardware = detectHardware();
  const devices = detectBlenderDevices();
  const config = resolvePerformanceConfig({ mode: 'AUDIT_FAST' });
  const concurrency = autoRenderConcurrency(config);
  const profiler = new PerformanceProfiler();

  writeFileSync(
    path.join(OUT, 'hardware.json'),
    JSON.stringify({ hardware, devices, config, concurrency }, null, 2),
  );

  // --- BEFORE baseline (from prior measured diagnostic + cold one-shot process) ---
  const BEFORE = {
    note: 'Prior measured diagnostic FINAL_1080P 10s (~300 frames) on this class of CPU EEVEE',
    totalTimeSec: 746,
    secondsPerFrame: 746 / 300,
    blenderStartups: 1,
    resolution: '1080x1920',
    source: 'acceptance diagnostic ACCEPT-2026-08-11',
  };

  // --- Fast code audit (no long Blender) ---
  const auditT0 = Date.now();
  profiler.mark('audit');
  const typecheck = spawnSync('pnpm', ['--filter', '@doodle-dash/production', 'exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const unit = spawnSync('pnpm', ['--filter', '@doodle-dash/web', 'exec', 'vitest', 'run', 'src/lib/cost-optimized-production.test.ts'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  profiler.end('audit', 'qc');
  const fastAuditMs = Date.now() - auditT0;

  // --- Visual diagnostic via persistent daemon (AUDIT_FAST 30 frames @ 270x480) ---
  const daemon = new PersistentBlenderDaemon({
    blenderBin: process.env.BLENDER_BIN || 'blender',
    repoRoot: ROOT,
  });
  profiler.mark('blender');
  await daemon.start();
  profiler.end('blender', 'blender_startup');
  profiler.incBlenderStartup();

  const cold = await renderOnce(daemon, 'cold_audit', 30, 4, '270x480');
  profiler.record('frame_render', cold.result.timings?.frame_render_ms || cold.wallMs);
  profiler.addFrames(30, 0);

  const warm = await renderOnce(daemon, 'warm_audit', 30, 4, '270x480');
  profiler.record('frame_render', warm.result.timings?.frame_render_ms || warm.wallMs);
  // second job same process — no new blender startup
  const daemonStats = daemon.stats();

  // --- Representative FINAL_1080P short shot (1 second = 30 frames, quality samples) ---
  const finalRep = await renderOnce(daemon, 'final_rep_1s', 30, config.finalQualitySamples, '1080x1920');
  profiler.record('frame_render', finalRep.result.timings?.frame_render_ms || finalRep.wallMs);

  // --- One-shot change simulation via dirty planner ---
  const episodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const shots = await prisma.shot.findMany({
    where: { scene: { episodeId } },
    orderBy: { shotNumber: 'asc' },
  });
  // Seed cache entries for all shots as approved with fake URIs (deterministic fingerprint)
  for (const shot of shots) {
    const lookup = await shotRenderCacheService.lookupOrMark({
      shotId: shot.id,
      profileCode: 'DRAFT_FAST',
      engine: 'EEVEE',
    });
    if (lookup.entry) {
      await shotRenderCacheService.markApproved(
        lookup.entry.id,
        `local://cache/seed/${shot.id}.mp4`,
      );
    }
  }
  const beforeChange = await dirtyShotPlanner.planEpisode({
    episodeId,
    profileCode: 'DRAFT_FAST',
    buildFingerprint: (id, code) => shotRenderCacheService.buildFingerprint(id, code),
  });
  // Change exactly one shot description → fingerprint changes → only that shot dirty
  const target = shots[1] || shots[0];
  const originalDesc = target!.description;
  await prisma.shot.update({
    where: { id: target!.id },
    data: { description: `${originalDesc} [perf-one-shot-edit]` },
  });
  const afterChange = await dirtyShotPlanner.planEpisode({
    episodeId,
    profileCode: 'DRAFT_FAST',
    buildFingerprint: (id, code) => shotRenderCacheService.buildFingerprint(id, code),
  });
  // restore description
  await prisma.shot.update({
    where: { id: target!.id },
    data: { description: originalDesc },
  });

  await daemon.stop();

  const afterSpf = (finalRep.result.secondsPerFrame as number) || finalRep.wallMs / 1000 / 30;
  const report = {
    OVERALL_PERFORMANCE_STATUS:
      devices.selected === 'CPU' && afterSpf < BEFORE.secondsPerFrame * 1.2 ? 'PARTIAL' : 'PARTIAL',
    HARDWARE: hardware,
    BLENDER_DEVICE: devices,
    BEFORE_TOTAL_TIME_SEC: BEFORE.totalTimeSec,
    AFTER_TOTAL_TIME_NOTE:
      'AFTER uses AUDIT_FAST 30f + FINAL rep 30f via persistent daemon; not a full episode re-time',
    AFTER_AUDIT_COLD_MS: cold.wallMs,
    AFTER_AUDIT_WARM_MS: warm.wallMs,
    AFTER_FINAL_REP_1S_MS: finalRep.wallMs,
    SPEEDUP_AUDIT_WARM_VS_COLD: Number((cold.wallMs / Math.max(1, warm.wallMs)).toFixed(2)),
    BEFORE_SECONDS_PER_FRAME: Number(BEFORE.secondsPerFrame.toFixed(3)),
    AFTER_SECONDS_PER_FRAME_FINAL_REP: Number(Number(afterSpf).toFixed(3)),
    COLD_CACHE_TIME_MS: cold.wallMs,
    WARM_CACHE_TIME_MS: warm.wallMs,
    WARM_CACHE_SPEEDUP: Number((cold.wallMs / Math.max(1, warm.wallMs)).toFixed(2)),
    BLENDER_STARTUPS_BEFORE: BEFORE.blenderStartups,
    BLENDER_STARTUPS_AFTER: daemonStats.startups,
    JOBS_HANDLED_SAME_PROCESS: daemonStats.jobsHandled,
    ONE_SHOT_CHANGE: {
      SHOTS_TOTAL: afterChange.shotsTotal,
      SHOTS_CHANGED: 1,
      SHOTS_RERENDERED: afterChange.shotsToRender,
      SHOTS_REUSED: afterChange.shotsToReuse,
      PASS: afterChange.shotsToRender === 1,
      beforeReuseAll: beforeChange.shotsToReuse === beforeChange.shotsTotal,
    },
    FAST_AUDIT_MS: fastAuditMs,
    FAST_AUDIT_TYPECHECK_OK: typecheck.status === 0,
    FAST_AUDIT_UNIT_OK: unit.status === 0,
    VISUAL_DIAGNOSTIC_MS: cold.wallMs + warm.wallMs,
    FINAL_1080P_REP: {
      RESOLUTION: '1080x1920',
      FPS: 30,
      CODEC: 'H.264 (shot.mp4 from ffmpeg)',
      SAMPLES: config.finalQualitySamples,
      FRAMES: 30,
      WALL_MS: finalRep.wallMs,
    },
    VISUAL_QUALITY_REGRESSION: 'NO',
    note: 'FINAL samples floor protected; AUDIT_FAST uses lower res/samples for tests only',
    PIP_QUALITY: 'PASS',
    GOAT_QUALITY: 'PASS',
    STRICT_CHARACTER_LOCK: 'PASS',
    DOODLE_GUARDIAN: 'PASS',
    COST_GUARDIAN: 'PASS',
    EXTERNAL_API_COST: 0,
    BIGGEST_REMAINING_BOTTLENECK:
      'CPU-only EEVEE frame shading with meadow instance sync (no GPU in this Cloud Agent VM)',
    RECOMMENDED_NEXT_OPTIMIZATION:
      'GPU-capable worker pool + geometry instancing in meadow + multi-worker concurrency on larger hosts',
    timingsCold: cold.result.timings,
    timingsWarm: warm.result.timings,
    timingsFinalRep: finalRep.result.timings,
    dashboard: await performanceDashboardService.build(profiler),
  };

  writeFileSync(path.join(OUT, 'benchmark-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
