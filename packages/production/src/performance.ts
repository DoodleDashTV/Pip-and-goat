/**
 * DDP Production Performance — centralized config, profiling, caching, dirty-shot.
 * Preserves FINAL_1080P quality; AUDIT_FAST is for automated tests only.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prisma } from '@doodle-dash/database';
import { AppError } from '@doodle-dash/shared';

export const PERFORMANCE_MODES = ['AUDIT_FAST', 'DRAFT_FAST', 'DRAFT_HD', 'FINAL_1080P'] as const;
export type PerformanceMode = (typeof PERFORMANCE_MODES)[number];

export type DdpPerformanceConfig = {
  mode: PerformanceMode;
  renderConcurrency: number | 'AUTO';
  persistentBlenderWorkers: boolean;
  enableShotCache: boolean;
  enableFrameCache: boolean;
  enableVoiceCache: boolean;
  enableAssetCache: boolean;
  gpuAutoSelect: boolean;
  maxRamPercent: number;
  maxVramPercent: number;
  auditFastMode: boolean;
  selectedRenderDevice: 'CPU' | 'CUDA' | 'OPTIX' | 'HIP' | 'METAL' | 'ONEAPI' | 'AUTO';
  cacheRoot: string;
  finalQualitySamples: number;
  draftFastSamples: number;
  auditMaxFrames: number;
};

const DEFAULTS: DdpPerformanceConfig = {
  mode: (process.env.DDP_PERFORMANCE_MODE as PerformanceMode) || 'DRAFT_FAST',
  renderConcurrency:
    process.env.RENDER_CONCURRENCY === 'AUTO' || !process.env.RENDER_CONCURRENCY
      ? 'AUTO'
      : Math.max(1, Number(process.env.RENDER_CONCURRENCY) || 1),
  persistentBlenderWorkers: String(process.env.PERSISTENT_BLENDER_WORKERS ?? 'true').toLowerCase() !== 'false',
  enableShotCache: String(process.env.ENABLE_SHOT_CACHE ?? 'true').toLowerCase() !== 'false',
  enableFrameCache: String(process.env.ENABLE_FRAME_CACHE ?? 'true').toLowerCase() !== 'false',
  enableVoiceCache: String(process.env.ENABLE_VOICE_CACHE ?? 'true').toLowerCase() !== 'false',
  enableAssetCache: String(process.env.ENABLE_ASSET_CACHE ?? 'true').toLowerCase() !== 'false',
  gpuAutoSelect: String(process.env.GPU_AUTO_SELECT ?? 'true').toLowerCase() !== 'false',
  maxRamPercent: Number(process.env.MAX_RAM_PERCENT || 75),
  maxVramPercent: Number(process.env.MAX_VRAM_PERCENT || 80),
  auditFastMode: String(process.env.AUDIT_FAST_MODE ?? 'false').toLowerCase() === 'true',
  selectedRenderDevice: (process.env.BLENDER_RENDER_DEVICE as DdpPerformanceConfig['selectedRenderDevice']) || 'AUTO',
  cacheRoot: process.env.DDP_CACHE_ROOT || path.resolve(process.cwd(), '.doodle-dash-cache'),
  // FINAL quality floor — do not lower below polished EEVEE for toon characters
  finalQualitySamples: Number(process.env.FINAL_EEVEE_SAMPLES || 20),
  draftFastSamples: Number(process.env.DRAFT_EEVEE_SAMPLES || 8),
  auditMaxFrames: Number(process.env.AUDIT_MAX_FRAMES || 30),
};

export function resolvePerformanceConfig(overrides: Partial<DdpPerformanceConfig> = {}): DdpPerformanceConfig {
  const mode = overrides.mode || (process.env.DDP_PERFORMANCE_MODE as PerformanceMode) || DEFAULTS.mode;
  return {
    ...DEFAULTS,
    ...overrides,
    mode,
    auditFastMode: mode === 'AUDIT_FAST' || overrides.auditFastMode || DEFAULTS.auditFastMode,
  };
}

export function autoRenderConcurrency(cfg: DdpPerformanceConfig = resolvePerformanceConfig()): number {
  if (typeof cfg.renderConcurrency === 'number') return Math.max(1, cfg.renderConcurrency);
  const cpus = os.cpus().length || 1;
  const ramGiB = os.totalmem() / 1024 ** 3;
  // Each Blender EEVEE job ~1–2 GiB; leave headroom
  const byRam = Math.max(1, Math.floor((ramGiB * (cfg.maxRamPercent / 100)) / 2.5));
  const byCpu = Math.max(1, Math.floor(cpus / 2));
  return Math.min(byRam, byCpu, 4);
}

export function profileResolution(mode: PerformanceMode): {
  resolution: '270x480' | '540x960' | '720x1280' | '1080x1920';
  fps: 30;
  samples: number;
  purpose: string;
} {
  const cfg = resolvePerformanceConfig({ mode });
  switch (mode) {
    case 'AUDIT_FAST':
      return {
        resolution: '270x480',
        fps: 30,
        samples: 4,
        purpose: 'Automated pipeline correctness only — NEVER final visual proof',
      };
    case 'DRAFT_FAST':
      return { resolution: '540x960', fps: 30, samples: cfg.draftFastSamples, purpose: 'story timing review' };
    case 'DRAFT_HD':
      return { resolution: '720x1280', fps: 30, samples: 12, purpose: 'high-confidence draft' };
    case 'FINAL_1080P':
      return {
        resolution: '1080x1920',
        fps: 30,
        samples: cfg.finalQualitySamples,
        purpose: 'publishing final — quality protected',
      };
  }
}

export function shaFingerprint(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export type TimingPhase =
  | 'app_startup'
  | 'api_startup'
  | 'db_storage_init'
  | 'blender_startup'
  | 'scene_loading'
  | 'asset_loading'
  | 'scene_assembly'
  | 'rig_init'
  | 'animation_application'
  | 'facial_visemes'
  | 'simulation'
  | 'frame_render'
  | 'audio_generation'
  | 'audio_mixing'
  | 'captions'
  | 'ffmpeg_encoding'
  | 'qc'
  | 'doodle_guardian'
  | 'strict_character_lock'
  | 'cost_guardian'
  | 'storage_transfer'
  | 'hashing'
  | 'final_packaging';

export type TimingRecord = {
  phase: TimingPhase | string;
  ms: number;
  meta?: Record<string, unknown>;
};

export class PerformanceProfiler {
  private marks = new Map<string, number>();
  private records: TimingRecord[] = [];
  private blenderStartups = 0;
  private framesRendered = 0;
  private framesReused = 0;
  private shotsRendered = 0;
  private shotsReused = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  mark(name: string) {
    this.marks.set(name, Date.now());
  }

  end(name: string, phase: TimingPhase | string, meta?: Record<string, unknown>) {
    const start = this.marks.get(name) ?? Date.now();
    const ms = Date.now() - start;
    this.records.push({ phase, ms, meta });
    this.marks.delete(name);
    return ms;
  }

  record(phase: TimingPhase | string, ms: number, meta?: Record<string, unknown>) {
    this.records.push({ phase, ms, meta });
  }

  incBlenderStartup() {
    this.blenderStartups += 1;
  }

  addFrames(rendered: number, reused = 0) {
    this.framesRendered += rendered;
    this.framesReused += reused;
  }

  addShots(rendered: number, reused = 0) {
    this.shotsRendered += rendered;
    this.shotsReused += reused;
  }

  addCache(hit: boolean) {
    if (hit) this.cacheHits += 1;
    else this.cacheMisses += 1;
  }

  snapshot() {
    const byPhase: Record<string, number> = {};
    for (const r of this.records) byPhase[r.phase] = (byPhase[r.phase] || 0) + r.ms;
    const totalMs = Object.values(byPhase).reduce((a, b) => a + b, 0);
    const frameTimes = this.records.filter((r) => r.phase === 'frame_render').map((r) => r.ms);
    const avgFrame =
      frameTimes.length > 0 ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length : null;
    return {
      byPhase,
      totalMs,
      blenderStartups: this.blenderStartups,
      framesRendered: this.framesRendered,
      framesReused: this.framesReused,
      shotsRendered: this.shotsRendered,
      shotsReused: this.shotsReused,
      shotCacheHitRate:
        this.shotsRendered + this.shotsReused > 0
          ? this.shotsReused / (this.shotsRendered + this.shotsReused)
          : null,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      avgSecondsPerFrame: avgFrame != null ? avgFrame / 1000 : null,
      minSecondsPerFrame: frameTimes.length ? Math.min(...frameTimes) / 1000 : null,
      maxSecondsPerFrame: frameTimes.length ? Math.max(...frameTimes) / 1000 : null,
      records: this.records,
    };
  }
}

export class ContentAddressedCache {
  constructor(private readonly root = resolvePerformanceConfig().cacheRoot) {
    mkdirSync(this.root, { recursive: true });
  }

  pathFor(namespace: string, fingerprint: string, fileName: string) {
    const dir = path.join(this.root, namespace, fingerprint.slice(0, 2), fingerprint);
    return path.join(dir, fileName);
  }

  async has(namespace: string, fingerprint: string, fileName: string) {
    return existsSync(this.pathFor(namespace, fingerprint, fileName));
  }

  async get(namespace: string, fingerprint: string, fileName: string) {
    const p = this.pathFor(namespace, fingerprint, fileName);
    if (!existsSync(p)) return null;
    return { path: p, bytes: await fs.readFile(p) };
  }

  async put(namespace: string, fingerprint: string, fileName: string, bytes: Uint8Array | Buffer) {
    const p = this.pathFor(namespace, fingerprint, fileName);
    mkdirSync(path.dirname(p), { recursive: true });
    await fs.writeFile(p, bytes);
    writeFileSync(
      path.join(path.dirname(p), 'meta.json'),
      JSON.stringify({ namespace, fingerprint, fileName, bytes: bytes.length, at: new Date().toISOString() }, null, 2),
    );
    return p;
  }
}

export class DirtyShotPlanner {
  /**
   * Given prior approved shot cache fingerprints, decide which shots must rerender.
   */
  async planEpisode(input: {
    episodeId: string;
    profileCode: string;
    buildFingerprint: (shotId: string, profileCode: string) => Promise<string>;
  }) {
    const shots = await prisma.shot.findMany({
      where: { scene: { episodeId: input.episodeId } },
      include: { scene: true },
      orderBy: [{ scene: { sceneNumber: 'asc' } }, { shotNumber: 'asc' }],
    });
    const plan = [];
    for (const shot of shots) {
      const fp = await input.buildFingerprint(shot.id, input.profileCode);
      const cached = await prisma.shotRenderCacheEntry.findUnique({
        where: {
          shotId_fingerprint_profileCode: {
            shotId: shot.id,
            fingerprint: fp,
            profileCode: input.profileCode,
          },
        },
      });
      const reusable = Boolean(cached?.approved && cached.outputUri);
      plan.push({
        shotId: shot.id,
        shotNumber: shot.shotNumber,
        fingerprint: fp,
        action: reusable ? ('REUSE' as const) : ('RENDER' as const),
        outputUri: cached?.outputUri ?? null,
      });
    }
    return {
      shotsTotal: plan.length,
      shotsToRender: plan.filter((p) => p.action === 'RENDER').length,
      shotsToReuse: plan.filter((p) => p.action === 'REUSE').length,
      plan,
    };
  }
}

export type HardwareProfile = {
  cpuModel: string;
  cpuCores: number;
  ramGiB: number;
  gpu: string;
  vram: string;
  os: string;
  blenderVersion: string;
  selectedRenderDevice: string;
  hardwareEncoder: string[];
  diskHint: string;
};

export function detectHardware(): HardwareProfile {
  const cpuModel =
    spawnSync('bash', ['-lc', "lscpu | awk -F: '/Model name/{print $2; exit}'"], { encoding: 'utf8' })
      .stdout?.trim() || os.cpus()[0]?.model || 'unknown';
  const nvidia = spawnSync('nvidia-smi', ['-L'], { encoding: 'utf8' });
  const gpu = nvidia.status === 0 ? (nvidia.stdout || '').trim() || 'NVIDIA present' : 'NONE_DETECTED';
  const encoders: string[] = [];
  const ffmpeg = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const out = ffmpeg.stdout || '';
  if (out.includes('h264_nvenc')) encoders.push('h264_nvenc');
  if (out.includes('h264_qsv')) encoders.push('h264_qsv');
  if (out.includes('h264_vaapi')) encoders.push('h264_vaapi');
  if (out.includes('libx264')) encoders.push('libx264');
  const blender = spawnSync('blender', ['--version'], { encoding: 'utf8' });
  return {
    cpuModel,
    cpuCores: os.cpus().length,
    ramGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    gpu,
    vram: gpu === 'NONE_DETECTED' ? 'N/A' : 'see nvidia-smi',
    os: `${os.type()} ${os.release()}`,
    blenderVersion: (blender.stdout || '').split('\n')[0] || 'unknown',
    selectedRenderDevice: gpu === 'NONE_DETECTED' ? 'CPU' : 'AUTO',
    hardwareEncoder: encoders,
    diskHint: 'check lsblk ROTA (1=HDD/unknown virt)',
  };
}

export function detectBlenderDevices(blenderBin = process.env.BLENDER_BIN || 'blender') {
  const script = `
import bpy, json
devices=[]
try:
  prefs=bpy.context.preferences.addons['cycles'].preferences
  prefs.get_devices()
  for d in prefs.devices:
    devices.append({"name": d.name, "type": d.type, "use": bool(d.use)})
except Exception as e:
  devices.append({"error": str(e)})
print("DDP_DEVICES:" + json.dumps({"eevee":"CPU", "cycles": devices}))
`;
  const tmp = path.join(os.tmpdir(), `ddp-devices-${Date.now()}.py`);
  writeFileSync(tmp, script);
  const res = spawnSync(blenderBin, ['-b', '--factory-startup', '-P', tmp], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  const line = (res.stdout || '')
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('DDP_DEVICES:'));
  if (!line) {
    return {
      available: false as const,
      selected: 'CPU' as const,
      devices: [],
      note: 'GPU devices unavailable — EEVEE/Cycles will use CPU in this environment.',
      raw: (res.stderr || '').slice(-300),
    };
  }
  const payload = JSON.parse(line.slice('DDP_DEVICES:'.length)) as {
    eevee: string;
    cycles: Array<{ name: string; type: string; use: boolean }>;
  };
  const gpuTypes = new Set(['CUDA', 'OPTIX', 'HIP', 'METAL', 'ONEAPI']);
  const gpu = payload.cycles.find((d) => gpuTypes.has(String(d.type).toUpperCase()));
  return {
    available: Boolean(gpu),
    selected: (gpu ? String(gpu.type).toUpperCase() : 'CPU') as string,
    devices: payload.cycles,
    note: gpu
      ? `GPU device detected: ${gpu.name}`
      : 'No Blender GPU device — rendering on CPU. Do not claim GPU acceleration.',
  };
}

export type PerformanceDashboard = {
  config: DdpPerformanceConfig;
  hardware: HardwareProfile;
  concurrency: number;
  blenderDevice: ReturnType<typeof detectBlenderDevices>;
  latestProfiler?: ReturnType<PerformanceProfiler['snapshot']>;
  metrics: {
    totalJobTimeMs?: number;
    blenderStartupTimeMs?: number;
    sceneAssemblyTimeMs?: number;
    animationPrepTimeMs?: number;
    renderTimeMs?: number;
    secondsPerFrame?: number | null;
    framesRendered?: number;
    framesReused?: number;
    shotsRendered?: number;
    shotsReused?: number;
    cacheHitRate?: number | null;
    audioTimeMs?: number;
    encodeTimeMs?: number;
    qcTimeMs?: number;
    uploadTimeMs?: number;
    apiCost: number;
    renderMinutesPerFinishedMinute?: number | null;
  };
};

export class PerformanceDashboardService {
  async build(profiler?: PerformanceProfiler): Promise<PerformanceDashboard> {
    const config = resolvePerformanceConfig();
    const hardware = detectHardware();
    const blenderDevice = detectBlenderDevices();
    const snap = profiler?.snapshot();
    const finishedSec =
      snap?.framesRendered && snap.framesRendered > 0 ? snap.framesRendered / 30 : null;
    const renderMinPerFinished =
      finishedSec && snap?.byPhase?.frame_render
        ? snap.byPhase.frame_render / 1000 / 60 / (finishedSec / 60)
        : null;
    return {
      config,
      hardware: {
        ...hardware,
        selectedRenderDevice: blenderDevice.selected,
      },
      concurrency: autoRenderConcurrency(config),
      blenderDevice,
      latestProfiler: snap,
      metrics: {
        totalJobTimeMs: snap?.totalMs,
        blenderStartupTimeMs: snap?.byPhase?.blender_startup,
        sceneAssemblyTimeMs: snap?.byPhase?.scene_assembly,
        animationPrepTimeMs: snap?.byPhase?.animation_application,
        renderTimeMs: snap?.byPhase?.frame_render,
        secondsPerFrame: snap?.avgSecondsPerFrame,
        framesRendered: snap?.framesRendered,
        framesReused: snap?.framesReused,
        shotsRendered: snap?.shotsRendered,
        shotsReused: snap?.shotsReused,
        cacheHitRate: snap?.shotCacheHitRate,
        audioTimeMs: snap?.byPhase?.audio_generation,
        encodeTimeMs: snap?.byPhase?.ffmpeg_encoding,
        qcTimeMs: snap?.byPhase?.qc,
        uploadTimeMs: snap?.byPhase?.storage_transfer,
        apiCost: 0,
        renderMinutesPerFinishedMinute: renderMinPerFinished,
      },
    };
  }
}

export const contentAddressedCache = new ContentAddressedCache();
export const dirtyShotPlanner = new DirtyShotPlanner();
export const performanceDashboardService = new PerformanceDashboardService();
export const globalPerformanceProfiler = new PerformanceProfiler();

/** Assert FINAL_1080P quality knobs are not silently lowered. */
export function assertFinalQualityNotDegraded(samples: number) {
  const floor = resolvePerformanceConfig().finalQualitySamples;
  if (samples < Math.min(floor, 16)) {
    throw new AppError(
      `FINAL_1080P quality protection: samples ${samples} below safe floor.`,
      'FINAL_QUALITY_REGRESSION',
      409,
    );
  }
}

/**
 * Soft regression guards — flag material regressions without hard-failing across hardware.
 * Thresholds are relative to a recorded baseline for the same machine class when available.
 */
export type PerformanceGuardResult = {
  status: 'PASS' | 'WARN' | 'FAIL';
  flags: string[];
  machine: { cpuCores: number; ramGiB: number; device: string };
  measured: Record<string, number | null>;
  thresholds: Record<string, number>;
};

export function evaluatePerformanceGuards(input: {
  blenderStartups: number;
  jobsHandled?: number;
  secondsPerFrame: number | null;
  episodeProductionMs: number | null;
  cacheHitPct: number | null;
  reusedShotPct: number | null;
  completeShotMs?: number | null;
  /** Optional prior baseline on similar hardware (from previous acceptance run). */
  baseline?: Partial<{
    secondsPerFrame: number;
    episodeProductionMs: number;
    blenderStartups: number;
  }>;
}): PerformanceGuardResult {
  const hw = detectHardware();
  const flags: string[] = [];
  // Absolute ceilings are intentionally loose — Cloud Agent CPU VMs vary widely.
  const thresholds = {
    maxBlenderStartupsPerWarmEpisode: 2,
    maxSecondsPerFrameCpuFinal: 12,
    minCacheHitPctWarmRerun: 80,
    minReusedShotPctWarmRerun: 80,
    maxEpisodeRegressionFactor: 1.5,
  };
  if (input.blenderStartups > thresholds.maxBlenderStartupsPerWarmEpisode && (input.jobsHandled || 0) > 1) {
    flags.push(
      `WARN: Blender startups=${input.blenderStartups} for ${input.jobsHandled} jobs — persistent daemon may not be reusing process`,
    );
  }
  if (input.secondsPerFrame != null && hw.gpu === 'NONE_DETECTED') {
    if (input.secondsPerFrame > thresholds.maxSecondsPerFrameCpuFinal) {
      flags.push(
        `WARN: FINAL seconds/frame ${input.secondsPerFrame.toFixed(2)} exceeds soft CPU ceiling ${thresholds.maxSecondsPerFrameCpuFinal}`,
      );
    }
  }
  if (input.cacheHitPct != null && input.cacheHitPct * 100 < thresholds.minCacheHitPctWarmRerun) {
    flags.push(
      `WARN: warm cache hit ${(input.cacheHitPct * 100).toFixed(0)}% below ${thresholds.minCacheHitPctWarmRerun}%`,
    );
  }
  if (input.reusedShotPct != null && input.reusedShotPct * 100 < thresholds.minReusedShotPctWarmRerun) {
    flags.push(
      `WARN: reused shot ${(input.reusedShotPct * 100).toFixed(0)}% below ${thresholds.minReusedShotPctWarmRerun}%`,
    );
  }
  if (
    input.baseline?.episodeProductionMs &&
    input.episodeProductionMs &&
    input.episodeProductionMs > input.baseline.episodeProductionMs * thresholds.maxEpisodeRegressionFactor
  ) {
    flags.push(
      `FAIL: episode time ${input.episodeProductionMs}ms > ${thresholds.maxEpisodeRegressionFactor}× baseline ${input.baseline.episodeProductionMs}ms`,
    );
  }
  const status = flags.some((f) => f.startsWith('FAIL'))
    ? 'FAIL'
    : flags.some((f) => f.startsWith('WARN'))
      ? 'WARN'
      : 'PASS';
  return {
    status,
    flags,
    machine: {
      cpuCores: hw.cpuCores,
      ramGiB: hw.ramGiB,
      device: hw.selectedRenderDevice,
    },
    measured: {
      blenderStartups: input.blenderStartups,
      secondsPerFrame: input.secondsPerFrame,
      episodeProductionMs: input.episodeProductionMs,
      cacheHitPct: input.cacheHitPct,
      reusedShotPct: input.reusedShotPct,
      completeShotMs: input.completeShotMs ?? null,
    },
    thresholds,
  };
}
