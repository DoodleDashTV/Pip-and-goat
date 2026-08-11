/**
 * AUDIT_FAST — seconds-scale production preflight.
 * NEVER queues full shot animation renders. Uses one Blender daemon + micro frames.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  accessSync,
  constants,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';
import { shotRenderCacheService } from './cost-optimized-production';
import {
  detectHardware,
  dirtyShotPlanner,
  resolvePerformanceConfig,
} from './performance';

const require = createRequire(__filename);

const AUDIT_MAX_MS = 180_000; // 3 minutes acceptable
const AUDIT_FAIL_MS = 300_000; // 5 minutes = PERFORMANCE FAILURE
const STALL_MS = 120_000;

export type AuditStageTiming = {
  stage: string;
  sec: number;
  ms: number;
  detail?: string;
};

function resolveRepoRoot(explicit?: string) {
  if (explicit) return explicit;
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  // apps/web/scripts → repo root
  const fromCwd = path.resolve(process.cwd(), '../..');
  if (existsSync(path.join(fromCwd, 'production-library'))) return fromCwd;
  if (existsSync(path.join(process.cwd(), 'production-library'))) return process.cwd();
  return path.resolve(process.cwd(), '../..');
}

function shaFile(p: string) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function logLive(tag: string, label: string, sec: number, extra = '') {
  const line = `[${tag}] ${label}: ${sec.toFixed(2)} sec${extra ? ` — ${extra}` : ''}`;
  console.log(line);
  return line;
}

class StallWatch {
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private op: string) {}
  start() {
    this.timer = setInterval(() => {
      console.log(`[STALL] >120s still blocking on: ${this.op}`);
    }, STALL_MS);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

async function withStall<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const w = new StallWatch(op);
  w.start();
  try {
    return await fn();
  } finally {
    w.stop();
  }
}

function runConcurrent(tasks: Record<string, () => Promise<unknown> | unknown>) {
  const entries = Object.entries(tasks);
  return Promise.all(
    entries.map(async ([k, fn]) => {
      const t0 = Date.now();
      try {
        const value = await Promise.resolve(fn());
        return [k, { ok: true as const, value, ms: Date.now() - t0 }];
      } catch (e) {
        return [k, { ok: false as const, error: String(e), ms: Date.now() - t0 }];
      }
    }),
  ).then((pairs) => Object.fromEntries(pairs));
}

type Daemon = {
  start(): Promise<void>;
  ping(): Promise<unknown>;
  validateAssets(assets: object[]): Promise<{
    ok: boolean;
    checks?: unknown[];
    timings?: { pip_load_ms?: number; goat_load_ms?: number; asset_loading_ms?: number };
  }>;
  microRender(job: object): Promise<{ frameCount?: number; samples?: number; timings?: Record<string, number> }>;
  stop(): Promise<void>;
  stats(): { startups: number; jobsHandled: number };
};

/**
 * Stage A–D AUDIT_FAST. Does not enqueue RenderJob rows for episode shots.
 */
export async function runAuditFast(opts: { episodeId?: string; repoRoot?: string } = {}) {
  const repoRoot = resolveRepoRoot(opts.repoRoot);
  const LIB = path.join(repoRoot, 'production-library');
  const outDir = path.join(repoRoot, 'artifacts/performance/audit-fast');
  mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const lines: string[] = [];
  const timings: AuditStageTiming[] = [];
  const push = (tag: string, label: string, ms: number, detail?: string) => {
    const sec = ms / 1000;
    lines.push(logLive(tag, label, sec, detail));
    timings.push({ stage: label, sec, ms, detail });
  };

  // ─── STAGE A — STATIC PREFLIGHT (parallel, NO Blender process) ───
  const tA = Date.now();
  const staticResult = await withStall('static preflight checks', () =>
    runConcurrent({
      pipBlend: () => {
        const p = path.join(LIB, 'characters/pip_production.blend');
        if (!existsSync(p)) throw new Error('missing pip blend');
        return { path: p, sha256: shaFile(p), bytes: readFileSync(p).length };
      },
      goatBlend: () => {
        const p = path.join(LIB, 'characters/goat_production.blend');
        if (!existsSync(p)) throw new Error('missing goat blend');
        return { path: p, sha256: shaFile(p), bytes: readFileSync(p).length };
      },
      meadowBlend: () => {
        const p = path.join(LIB, 'environments/meadow_production.blend');
        if (!existsSync(p)) throw new Error('missing meadow blend');
        return { path: p, sha256: shaFile(p) };
      },
      mapBlend: () => {
        const p = path.join(LIB, 'props/adventure_map.blend');
        if (!existsSync(p)) throw new Error('missing map blend');
        return { path: p, sha256: shaFile(p) };
      },
      ffmpeg: () => {
        const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error('ffmpeg missing');
        return (r.stdout || '').split('\n')[0];
      },
      blenderBin: () => {
        const r = spawnSync('blender', ['--version'], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error('blender missing');
        return (r.stdout || '').split('\n')[0];
      },
      hardware: () => detectHardware(),
      blenderDeviceHint: () => {
        // Do NOT spawn a second Blender here — daemon Stage B is the single process.
        const hw = detectHardware();
        return {
          selected: hw.selectedRenderDevice,
          gpu: hw.gpu,
          note: 'Full Blender device enum deferred to persistent daemon (single startup).',
        };
      },
      outputWritable: () => {
        accessSync(outDir, constants.W_OK);
        const probe = path.join(outDir, `.write-probe-${Date.now()}`);
        writeFileSync(probe, 'ok');
        return probe;
      },
      config: () => {
        const cfg = resolvePerformanceConfig({ mode: 'AUDIT_FAST' });
        if (cfg.finalQualitySamples < 16) throw new Error('FINAL quality floor corrupted');
        return { resolution: '270x480', samples: 2, maxFrames: 3, mode: cfg.mode };
      },
      dbIntakes: async () => {
        const pip = await prisma.character.findFirstOrThrow({
          where: { internalCode: FOUNDING_CODES.PIP },
        });
        const goat = await prisma.character.findFirstOrThrow({
          where: { internalCode: FOUNDING_CODES.GOAT },
        });
        const intakes = await prisma.productionAssetIntake.findMany({
          where: {
            entityId: { in: [pip.id, goat.id] },
            kind: 'CHARACTER_BLEND',
            productionReady: true,
          },
          orderBy: { version: 'desc' },
        });
        return {
          pipId: pip.id,
          goatId: goat.id,
          intakeCount: intakes.length,
          checksums: intakes.slice(0, 4).map((i) => ({
            entityId: i.entityId,
            version: i.version,
            checksum: i.checksum,
          })),
        };
      },
      cacheKeys: async () => {
        if (!opts.episodeId) return { skipped: true };
        const shots = await prisma.shot.findMany({
          where: { scene: { episodeId: opts.episodeId } },
          orderBy: { shotNumber: 'asc' },
        });
        const keys = [];
        for (const s of shots) {
          const fp = await shotRenderCacheService.buildFingerprint(s.id, 'DRAFT_FAST');
          keys.push({ shotNumber: s.shotNumber, fingerprint: fp.slice(0, 16) });
        }
        const plan = await dirtyShotPlanner.planEpisode({
          episodeId: opts.episodeId,
          profileCode: 'DRAFT_FAST',
          buildFingerprint: (id, code) => shotRenderCacheService.buildFingerprint(id, code),
        });
        return {
          shots: keys.length,
          fingerprints: keys,
          planSummary: {
            total: plan.shotsTotal,
            render: plan.shotsToRender,
            reuse: plan.shotsToReuse,
          },
        };
      },
    }),
  );
  const staticFailed = Object.entries(staticResult).filter(([, v]) => !v.ok);
  push(
    'AUDIT',
    'Static preflight',
    Date.now() - tA,
    staticFailed.length ? `FAIL ${staticFailed.map(([k]) => k).join(',')}` : 'ok',
  );
  if (staticFailed.length) {
    throw new AppError(
      `AUDIT_FAST static preflight failed: ${staticFailed
        .map(([k, v]) => `${k}:${'error' in v ? v.error : ''}`)
        .join('; ')}`,
      'AUDIT_FAST_STATIC_FAIL',
      409,
    );
  }

  // Note: detectBlenderDevices() may spawn blender briefly — measured inside Stage A.
  // Stage B uses the persistent daemon as the single long-lived process.

  // ─── STAGE B — ONE Blender daemon startup + ping ───
  const tB = Date.now();
  const daemonMod = require(path.join(
    repoRoot,
    'workers/blender-renderer/src/persistent-daemon.js',
  )) as { PersistentBlenderDaemon: new (opts?: object) => Daemon };
  const daemon = new daemonMod.PersistentBlenderDaemon({
    blenderBin: process.env.BLENDER_BIN || 'blender',
    repoRoot,
  });
  await withStall('Blender daemon startup', () => daemon.start());
  await withStall('Blender daemon ping', () => daemon.ping());
  push('AUDIT', 'Blender startup', Date.now() - tB, `startups=${daemon.stats().startups}`);

  // ─── STAGE C — CHARACTER/ASSET VALIDATION (same process) ───
  const tC = Date.now();
  const pipPath = path.join(LIB, 'characters/pip_production.blend');
  const goatPath = path.join(LIB, 'characters/goat_production.blend');
  const meadowPath = path.join(LIB, 'environments/meadow_production.blend');
  const mapPath = path.join(LIB, 'props/adventure_map.blend');
  const validation = await withStall('daemon validate_assets (Pip+Goat+meadow)', () =>
    daemon.validateAssets([
      { id: 'pip', path: pipPath },
      { id: 'goat', path: goatPath },
      { id: 'meadow', path: meadowPath },
      { id: 'map', path: mapPath },
    ]),
  );
  if (!validation?.ok) {
    await daemon.stop();
    throw new AppError(
      `ASSET_CHECK BLOCKED — ${JSON.stringify(validation?.checks || validation)}`,
      'ASSET_CHECK_BLOCKED',
      409,
    );
  }
  const pipLoad = validation.timings?.pip_load_ms ?? null;
  const goatLoad = validation.timings?.goat_load_ms ?? null;
  push('AUDIT', 'Asset validation', Date.now() - tC, `pip=${pipLoad}ms goat=${goatLoad}ms`);

  // ─── STAGE D — MICRO RENDER (1 frame, 270x480, samples=2, no encode) ───
  const tD = Date.now();
  const microOut = path.join(outDir, 'micro');
  mkdirSync(microOut, { recursive: true });
  const micro = await withStall('micro_render 1 frame 270x480 samples=2', () =>
    daemon.microRender({
      resolution: '270x480',
      fps: 30,
      outputDir: microOut,
      assets: [
        { id: 'pip', localPath: pipPath },
        { id: 'goat', localPath: goatPath },
        { id: 'meadow', localPath: meadowPath },
        { id: 'map', localPath: mapPath },
      ],
      metadata: {
        samples: 2,
        startFrame: 1,
        endFrame: 1,
        skipEncode: true,
        auditMicro: true,
        cameraPreset: 'WIDE',
        shotMeta: {
          placements: {
            pip: { location: [-0.7, 0, 0], action: 'PIP_IDLE' },
            goat: { location: [0.9, 0, 0], action: 'GOAT_IDLE' },
          },
          actions: { pip: 'PIP_IDLE', goat: 'GOAT_IDLE' },
        },
      },
    }),
  );
  const microMs = Date.now() - tD;
  push('AUDIT', 'Micro-render', microMs, `frames=${micro?.frameCount || 0} samples=${micro?.samples}`);

  const daemonStats = daemon.stats();
  await daemon.stop();

  // Cache validation (planner only — no renders)
  const tCache = Date.now();
  let cacheValidation: unknown = { skipped: !opts.episodeId };
  if (opts.episodeId) {
    cacheValidation = await dirtyShotPlanner.planEpisode({
      episodeId: opts.episodeId,
      profileCode: 'DRAFT_FAST',
      buildFingerprint: (id, code) => shotRenderCacheService.buildFingerprint(id, code),
    });
  }
  const cacheMs = Date.now() - tCache;
  push('AUDIT', 'Cache validation', cacheMs, 'planner only');

  const totalMs = Date.now() - started;
  const totalSec = totalMs / 1000;
  let status: 'PASS' | 'FAIL' | 'PERFORMANCE_FAILURE' | 'ASSET_CHECK BLOCKED' = 'PASS';
  if (totalMs > AUDIT_FAIL_MS) status = 'PERFORMANCE_FAILURE';
  else if (totalMs > AUDIT_MAX_MS) status = 'FAIL';

  const slowest = [...timings].sort((a, b) => b.ms - a.ms)[0];
  const report = {
    AUDIT_FAST: status,
    totalSec,
    totalMs,
    blenderStartups: daemonStats.startups,
    jobsHandledSameProcess: daemonStats.jobsHandled,
    pipLoadMs: pipLoad,
    goatLoadMs: goatLoad,
    microRenderMs: microMs,
    cacheValidationMs: cacheMs,
    micro,
    validation,
    staticResult,
    cacheValidation,
    timings,
    liveLog: lines,
    slowestOperation: slowest,
    thresholds: {
      idealSec: 60,
      acceptableSec: 180,
      performanceFailureSec: 300,
    },
    note: 'AUDIT_FAST does not queue episode shot renders or run FINAL quality.',
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(path.join(outDir, 'audit-fast-report.json'), JSON.stringify(report, null, 2));
  console.log(`[AUDIT] TOTAL: ${totalSec.toFixed(2)} sec — ${status}`);
  return report;
}

/** Guard: episode queue must never treat AUDIT_FAST as a full multi-shot render. */
export function assertAuditFastDoesNotQueueFullRenders(profileCode: string) {
  if (profileCode === 'AUDIT_FAST') {
    throw new AppError(
      'AUDIT_FAST must use runAuditFast() — refusing to queue full shot animation renders.',
      'AUDIT_FAST_NO_FULL_RENDER',
      409,
    );
  }
}
