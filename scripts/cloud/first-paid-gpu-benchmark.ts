#!/usr/bin/env tsx
/**
 * DDP Engine 3.0 — first paid RTX 4090 FINAL_1080P 30-frame benchmark.
 *
 * Safety:
 * - Requires CLI --confirm-paid-launch
 * - Requires ALLOW_PAID_GPU_LAUNCH=true and CLOUD_RENDER_ENABLED=true in process env
 * - Hard cost ceiling default $0.50 (MAX_SINGLE_JOB_COST)
 * - Refuses to create a second ddp-first-gpu-bench* pod if one is already running
 * - Always attempts terminate on exit / timeout
 * - Never prints secret values
 */
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createObjectStorageFromConfig,
  resolveObjectStorageConfig,
  resolveR2BucketWithFallback,
  type ObjectStorage,
} from '@doodle-dash/shared';
import { RunpodClient } from '../../packages/production/src/cloud/runpod-client';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const POD_NAME_PREFIX = 'ddp-first-gpu-bench';
const GPU_TYPE_ID = 'NVIDIA GeForce RTX 4090';
/** Public Runpod image (no private registry required). Bootstrap installs Blender. */
const IMAGE_NAME =
  process.env.DDP_BENCH_IMAGE ??
  'runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04';
const HARD_CEILING_USD = Number(process.env.DDP_BENCH_HARD_CEILING_USD ?? '0.50');
const POLL_MS = Number(process.env.DDP_BENCH_POLL_MS ?? '15000');
const MAX_WAIT_MS = Number(process.env.DDP_BENCH_MAX_WAIT_MS ?? String(20 * 60 * 1000));

function redact(msg: string): string {
  let out = String(msg);
  for (const key of [
    'R2_SECRET_ACCESS_KEY',
    'R2_ACCESS_KEY_ID',
    'RUNPOD_API_KEY',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
  ]) {
    const v = process.env[key];
    if (v && v.trim()) out = out.split(v).join('[REDACTED]');
  }
  return out.replace(/\brpa_[A-Za-z0-9]+/g, '[REDACTED]');
}

function log(line: string) {
  console.log(line);
}

function requireFlag(argv: string[]) {
  if (!argv.includes('--confirm-paid-launch')) {
    throw new Error(
      'Refusing to start paid GPU: pass --confirm-paid-launch (Engine 3.0 explicit opt-in).',
    );
  }
}

function requirePaidEnv() {
  if (process.env.ALLOW_PAID_GPU_LAUNCH !== 'true') {
    throw new Error('ALLOW_PAID_GPU_LAUNCH must be exactly "true".');
  }
  if (process.env.CLOUD_RENDER_ENABLED !== 'true') {
    throw new Error('CLOUD_RENDER_ENABLED must be exactly "true".');
  }
  const maxJob = Number(process.env.MAX_SINGLE_JOB_COST ?? '2');
  if (!(maxJob <= HARD_CEILING_USD + 1e-9)) {
    throw new Error(
      `MAX_SINGLE_JOB_COST=${maxJob} exceeds hard ceiling $${HARD_CEILING_USD}.`,
    );
  }
}

async function uploadBenchBundle(
  storage: ObjectStorage,
  prefix: string,
): Promise<{ uploaded: string[] }> {
  const files: Array<{ local: string; key: string; ctype: string }> = [
    {
      local: join(ROOT, 'production-library/characters/pip_production.blend'),
      key: `${prefix}/production-library/characters/pip_production.blend`,
      ctype: 'application/octet-stream',
    },
    {
      local: join(ROOT, 'production-library/characters/goat_production.blend'),
      key: `${prefix}/production-library/characters/goat_production.blend`,
      ctype: 'application/octet-stream',
    },
    {
      local: join(ROOT, 'production-library/environments/meadow_production.blend'),
      key: `${prefix}/production-library/environments/meadow_production.blend`,
      ctype: 'application/octet-stream',
    },
    {
      local: join(ROOT, 'production-library/props/adventure_map.blend'),
      key: `${prefix}/production-library/props/adventure_map.blend`,
      ctype: 'application/octet-stream',
    },
    {
      local: join(ROOT, 'scripts/blender/first_gpu_benchmark.py'),
      key: `${prefix}/scripts/blender/first_gpu_benchmark.py`,
      ctype: 'text/x-python',
    },
    {
      local: join(ROOT, 'scripts/cloud/runpod-bench-bootstrap.sh'),
      key: `${prefix}/scripts/cloud/runpod-bench-bootstrap.sh`,
      ctype: 'text/x-shellscript',
    },
  ];

  const uploaded: string[] = [];
  for (const f of files) {
    const body = new Uint8Array(await fs.readFile(f.local));
    if (body.byteLength < 100) throw new Error(`Suspiciously small upload source: ${f.local}`);
    await storage.putObject(f.key, body, f.ctype);
    uploaded.push(f.key);
    log(`UPLOADED bytes=${body.byteLength} key=${f.key}`);
  }
  return { uploaded };
}

function buildDockerArgs(): string {
  // GraphQL only accepts dockerArgs (string). Decode bootstrap from env to avoid
  // fragile nested quoting and an R2 round-trip before apt/python exist.
  return "bash -c 'echo \"$DDP_BOOTSTRAP_B64\" | base64 -d > /tmp/runpod-bench-bootstrap.sh && chmod +x /tmp/runpod-bench-bootstrap.sh && exec bash /tmp/runpod-bench-bootstrap.sh'";
}

function estimateCostUsd(costPerHr: number | null | undefined, uptimeSec: number | null | undefined) {
  const rate = typeof costPerHr === 'number' && costPerHr > 0 ? costPerHr : 0.34;
  const secs = typeof uptimeSec === 'number' && uptimeSec > 0 ? uptimeSec : 0;
  return (rate * secs) / 3600;
}

async function downloadResults(storage: ObjectStorage, prefix: string, outDir: string) {
  await fs.mkdir(outDir, { recursive: true });
  const keys = [
    'results/gpu-benchmark-report.json',
    'results/shot.mp4',
    'results/bootstrap.log',
    'results/COMPLETE',
  ];
  const got: Record<string, string> = {};
  for (const suffix of keys) {
    const key = `${prefix}/${suffix}`;
    if (!storage.readObject) throw new Error('storage.readObject required');
    try {
      const bytes = await storage.readObject(key);
      const dest = join(outDir, suffix.replace(/\//g, '_'));
      await fs.writeFile(dest, Buffer.from(bytes));
      got[suffix] = dest;
      log(`DOWNLOADED ${suffix} -> ${dest} bytes=${bytes.byteLength}`);
    } catch (e) {
      log(`DOWNLOAD_MISS ${suffix}: ${redact((e as Error).message)}`);
    }
  }
  return got;
}

async function main() {
  const argv = process.argv.slice(2);
  requireFlag(argv);
  requirePaidEnv();

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `ddp-system-tests/first-gpu-benchmark/${runId}`;
  const outDir = join(ROOT, 'artifacts/first-gpu-benchmark', runId);

  log('=== DDP ENGINE 3.0 FIRST PAID GPU BENCHMARK ===');
  log(`RUN_ID: ${runId}`);
  log(`PREFIX: ${prefix}`);
  log(`GPU: ${GPU_TYPE_ID}`);
  log(`IMAGE: ${IMAGE_NAME}`);
  log(`HARD_CEILING_USD: ${HARD_CEILING_USD}`);
  log(`MAX_WAIT_MS: ${MAX_WAIT_MS}`);

  const env = { ...process.env } as Record<string, string | undefined>;
  if (!env.OBJECT_STORAGE_PROVIDER && (env.R2_BUCKET || env.R2_ENDPOINT)) {
    env.OBJECT_STORAGE_PROVIDER = 'r2';
  }
  const resolvedBucket = await resolveR2BucketWithFallback(env);
  env.R2_BUCKET = resolvedBucket.bucket;
  log(
    `R2_BUCKET_AUTORESOLVED: ${resolvedBucket.autoResolved ? 'YES' : 'NO'} REASON: ${resolvedBucket.reason}`,
  );
  const cfg = resolveObjectStorageConfig(env);
  if (cfg.provider !== 's3') throw new Error('R2/S3 required for paid GPU bench');
  const storage = createObjectStorageFromConfig(cfg);
  const client = new RunpodClient({ env });

  // Race guard vs Engine 2.0 / prior runs
  const existing = await client.listMyselfPods();
  const live = existing.filter(
    (p) =>
      (p.name ?? '').startsWith(POD_NAME_PREFIX) &&
      String(p.desiredStatus ?? '').toUpperCase() !== 'EXITED' &&
      String(p.desiredStatus ?? '').toUpperCase() !== 'TERMINATED',
  );
  log(
    `EXISTING_PODS: ${JSON.stringify(
      existing.map((p) => ({
        id: p.id,
        name: p.name,
        desiredStatus: p.desiredStatus,
        costPerHr: p.costPerHr,
      })),
    )}`,
  );
  if (live.length > 0) {
    throw new Error(
      `Refusing to create another paid pod; already live: ${live
        .map((p) => `${p.id}:${p.name}:${p.desiredStatus}`)
        .join(', ')}`,
    );
  }

  log('UPLOADING_BENCH_BUNDLE...');
  await uploadBenchBundle(storage, prefix);

  const bootstrapKey = `${prefix}/scripts/cloud/runpod-bench-bootstrap.sh`;
  const bootstrapBytes = await fs.readFile(join(ROOT, 'scripts/cloud/runpod-bench-bootstrap.sh'));
  const bootstrapB64 = Buffer.from(bootstrapBytes).toString('base64');
  const dockerArgs = buildDockerArgs();
  const podName = `${POD_NAME_PREFIX}-${runId.slice(0, 19)}`;

  const podEnv: Record<string, string> = {
    R2_BUCKET: (env.R2_BUCKET || '').trim(),
    R2_ENDPOINT: (env.R2_ENDPOINT || '').trim().replace(/\/+$/, ''),
    R2_ACCESS_KEY_ID: (env.R2_ACCESS_KEY_ID || '').trim(),
    R2_SECRET_ACCESS_KEY: (env.R2_SECRET_ACCESS_KEY || '').trim(),
    R2_REGION: (env.R2_REGION || 'auto').trim() || 'auto',
    RUNPOD_API_KEY: (env.RUNPOD_API_KEY || '').trim(),
    BENCH_PREFIX: prefix,
    DDP_BENCH_ROOT: '/workspace/ddp-bench',
    DDP_BOOTSTRAP_B64: bootstrapB64,
    CLOUD_RENDER_ENABLED: 'true',
    IDLE_SHUTDOWN_MINUTES: process.env.IDLE_SHUTDOWN_MINUTES || '2',
    MAX_JOB_RUNTIME_MINUTES: process.env.MAX_JOB_RUNTIME_MINUTES || '20',
  };

  log(`BOOTSTRAP_B64_CHARS: ${bootstrapB64.length}`);
  log('CREATING_POD (paid)...');
  const { podId } = await client.createPodForBenchmark({
    name: podName,
    imageName: IMAGE_NAME,
    gpuTypeId: GPU_TYPE_ID,
    confirmPaidLaunch: true,
    cloudType: 'COMMUNITY',
    containerDiskInGb: 40,
    volumeInGb: 0,
    dockerArgs,
    ports: '8080/http',
    deployCost: Number(process.env.MAX_GPU_HOURLY_PRICE ?? '0.40'),
    env: podEnv,
  });
  log(`POD_CREATED id=${podId} name=${podName}`);
  log('GPU CREATED: YES');
  log('GPU BILLING STARTED: YES');

  let terminalReason = 'unknown';
  let lastCost = 0;
  let report: Record<string, unknown> | null = null;

  const terminate = async (reason: string) => {
    terminalReason = reason;
    try {
      await client.terminatePod(podId);
      log(`TERMINATE_OK reason=${reason}`);
    } catch (e) {
      log(`TERMINATE_ERR reason=${reason} err=${redact((e as Error).message)}`);
    }
  };

  process.on('SIGINT', () => {
    void terminate('sigint').finally(() => process.exit(130));
  });
  process.on('SIGTERM', () => {
    void terminate('sigterm').finally(() => process.exit(143));
  });

  const started = Date.now();
  try {
    while (Date.now() - started < MAX_WAIT_MS) {
      const pod = await client.getPod(podId);
      const uptime = pod?.runtime?.uptimeInSeconds ?? null;
      const cost = estimateCostUsd(pod?.costPerHr, uptime);
      lastCost = cost;
      log(
        `POLL status=${pod?.desiredStatus ?? 'missing'} uptimeSec=${uptime ?? 'n/a'} costPerHr=${
          pod?.costPerHr ?? 'n/a'
        } estCostUsd=${cost.toFixed(4)} gpu=${pod?.machine?.gpuDisplayName ?? 'n/a'}`,
      );

      if (cost > HARD_CEILING_USD) {
        await terminate('hard_ceiling');
        throw new Error(`Hard ceiling $${HARD_CEILING_USD} exceeded (est $${cost.toFixed(4)}).`);
      }

      // Progress / result markers
      if (storage.exists) {
        const alive = await storage.exists(`${prefix}/results/BOOTSTRAP_ALIVE`);
        const started = await storage.exists(`${prefix}/results/BOOTSTRAP_START`);
        if (alive || started) {
          log(`BOOTSTRAP_MARKER alive=${alive} start=${started}`);
        }
        const complete = await storage.exists(`${prefix}/results/COMPLETE`);
        if (complete) {
          log('COMPLETE_MARKER_FOUND');
          await terminate('benchmark_complete');
          break;
        }
      }

      const status = String(pod?.desiredStatus ?? '').toUpperCase();
      if (status === 'EXITED' || status === 'TERMINATED') {
        log(`POD_ALREADY_${status}`);
        terminalReason = `pod_${status.toLowerCase()}`;
        break;
      }

      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    if (terminalReason === 'unknown') {
      await terminate('max_wait');
    }

    const downloads = await downloadResults(storage, prefix, outDir);
    const reportPath = downloads['results/gpu-benchmark-report.json'];
    if (reportPath) {
      report = JSON.parse(await fs.readFile(reportPath, 'utf8')) as Record<string, unknown>;
    }

    const wallMs = typeof report?.wallMs === 'number' ? report.wallMs : null;
    const timings = (report?.timings ?? null) as { frame_render_ms?: number } | null;
    const frameMs =
      timings && typeof timings.frame_render_ms === 'number' ? timings.frame_render_ms : null;
    const cpuBaseline = 127436;
    const compareMs = frameMs && frameMs > 0 ? frameMs : wallMs && wallMs > 0 ? wallMs : null;
    const speedup = compareMs ? (cpuBaseline / compareMs).toFixed(2) : 'n/a';

    const summary = {
      ok: Boolean(report && report.ok === true),
      runId,
      podId,
      podName,
      prefix,
      terminalReason,
      estimatedCostUsd: Number(lastCost.toFixed(4)),
      hardCeilingUsd: HARD_CEILING_USD,
      cpuBaselineFinalRep1sMs: cpuBaseline,
      gpuWallMs: wallMs,
      gpuFrameRenderMs: frameMs,
      approxSpeedupVsCpu: speedup,
      report,
      outDir,
    };
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(join(outDir, 'orchestrator-summary.json'), JSON.stringify(summary, null, 2));

    log('=== BENCHMARK SUMMARY ===');
    log(JSON.stringify(summary, null, 2));
    log(`READY_ARTIFACTS_DIR: ${outDir}`);

    // Final safety: ensure pod gone
    try {
      const after = await client.getPod(podId);
      if (
        after &&
        !['EXITED', 'TERMINATED'].includes(String(after.desiredStatus ?? '').toUpperCase())
      ) {
        await terminate('final_sweep');
      }
    } catch {
      /* ignore */
    }

    process.exit(summary.ok ? 0 : 1);
  } catch (e) {
    log(`FATAL: ${redact((e as Error).message)}`);
    await terminate('fatal');
    process.exit(1);
  }
}

main();
