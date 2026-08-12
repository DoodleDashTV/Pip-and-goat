#!/usr/bin/env tsx
/**
 * First paid GPU benchmark orchestrator (explicit approval required).
 * Hard ceiling: MAX_SINGLE_JOB_COST (default $0.50 for this run).
 * Never prints secret values. Always attempts pod terminate on exit.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  createObjectStorageFromConfig,
  resolveObjectStorageConfig,
} from '@doodle-dash/shared';
import { RunpodClient, resolveCloudCostLimitsFromEnv } from '../../packages/production/src/cloud';

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'artifacts', 'gpu-benchmark');
const BENCH_PREFIX = process.env.BENCH_PREFIX || 'ddp-system-tests/first-gpu-benchmark';
const GPU_TYPE = process.env.DDP_BENCH_GPU_TYPE || 'NVIDIA GeForce RTX 4090';
const IMAGE =
  process.env.DDP_BENCH_IMAGE ||
  'runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04';
const HARD_CEILING_USD = Number(process.env.MAX_SINGLE_JOB_COST || '0.50');
const MAX_WAIT_MS = Number(process.env.DDP_BENCH_MAX_WAIT_MS || String(22 * 60 * 1000));
const POLL_MS = 15_000;

function trimEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function estimateCost(uptimeSec: number, usdPerHr: number) {
  return Number(((uptimeSec / 3600) * usdPerHr).toFixed(4));
}

async function uploadBundle(
  storage: ReturnType<typeof createObjectStorageFromConfig>,
) {
  const files: Array<[string, string, string]> = [
    [
      path.join(ROOT, 'production-library/characters/pip_production.blend'),
      `${BENCH_PREFIX}/production-library/characters/pip_production.blend`,
      'application/octet-stream',
    ],
    [
      path.join(ROOT, 'production-library/characters/goat_production.blend'),
      `${BENCH_PREFIX}/production-library/characters/goat_production.blend`,
      'application/octet-stream',
    ],
    [
      path.join(ROOT, 'production-library/environments/meadow_production.blend'),
      `${BENCH_PREFIX}/production-library/environments/meadow_production.blend`,
      'application/octet-stream',
    ],
    [
      path.join(ROOT, 'production-library/props/adventure_map.blend'),
      `${BENCH_PREFIX}/production-library/props/adventure_map.blend`,
      'application/octet-stream',
    ],
    [
      path.join(ROOT, 'scripts/blender/first_gpu_benchmark.py'),
      `${BENCH_PREFIX}/scripts/blender/first_gpu_benchmark.py`,
      'text/x-python',
    ],
    [
      path.join(ROOT, 'scripts/cloud/runpod-bench-bootstrap.sh'),
      `${BENCH_PREFIX}/scripts/cloud/runpod-bench-bootstrap.sh`,
      'text/x-shellscript',
    ],
    [
      path.join(ROOT, 'scripts/cloud/fetch-bootstrap.py'),
      `${BENCH_PREFIX}/scripts/cloud/fetch-bootstrap.py`,
      'text/x-python',
    ],
  ];
  for (const [local, key, ctype] of files) {
    if (!existsSync(local)) throw new Error(`Missing bundle file: ${local}`);
    const body = readFileSync(local);
    await storage.putObject(key, body, ctype);
    console.log(`UPLOADED ${key} bytes=${body.byteLength}`);
  }
}

async function downloadResult(
  storage: ReturnType<typeof createObjectStorageFromConfig> & {
    readObject?: (key: string) => Promise<Uint8Array>;
    exists?: (key: string) => Promise<boolean>;
  },
  key: string,
  dest: string,
) {
  if (!storage.readObject) throw new Error('storage.readObject unavailable');
  const body = await storage.readObject(key);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, body);
  return body.byteLength;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Safety: require explicit flags for this process
  if (trimEnv('CLOUD_RENDER_ENABLED').toLowerCase() !== 'true') {
    throw new Error('Refusing: set CLOUD_RENDER_ENABLED=true for approved benchmark only');
  }
  if (trimEnv('ALLOW_PAID_GPU_LAUNCH').toLowerCase() !== 'true') {
    throw new Error('Refusing: set ALLOW_PAID_GPU_LAUNCH=true for approved benchmark only');
  }

  for (const k of ['R2_BUCKET', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'RUNPOD_API_KEY']) {
    if (!trimEnv(k)) throw new Error(`Missing required secret ${k}`);
    process.env[k] = trimEnv(k);
  }

  const limits = resolveCloudCostLimitsFromEnv(process.env as Record<string, string | undefined>);
  console.log('LIMITS', {
    cloudRenderEnabled: limits.cloudRenderEnabled,
    allowPaidGpuLaunch: limits.allowPaidGpuLaunch,
    maxGpuHourlyPrice: limits.maxGpuHourlyPrice,
    maxSingleJobCost: limits.maxSingleJobCost,
    maxDailyGpuCost: limits.maxDailyGpuCost,
    idleShutdownMinutes: limits.idleShutdownMinutes,
    maxJobRuntimeMinutes: limits.maxJobRuntimeMinutes,
  });
  if (limits.maxSingleJobCost > HARD_CEILING_USD + 1e-9) {
    throw new Error(`Refusing MAX_SINGLE_JOB_COST>${HARD_CEILING_USD}`);
  }

  const envForStorage = { ...process.env, OBJECT_STORAGE_PROVIDER: 'r2' };
  const cfg = resolveObjectStorageConfig(envForStorage);
  const storage = createObjectStorageFromConfig(cfg);
  if (!('assertBucketReachable' in storage)) throw new Error('R2 storage required');
  await (storage as { assertBucketReachable: () => Promise<void> }).assertBucketReachable();
  console.log('R2_REACHABLE: YES');

  console.log('=== UPLOAD BENCH BUNDLE ===');
  await uploadBundle(storage);

  const client = new RunpodClient();
  const auth = await client.verifyAuthAndListGpus();
  if (!auth.ok) throw new Error(`Runpod auth failed: ${auth.message}`);
  const gpu = auth.preferred.find((g) => g.id === GPU_TYPE) || auth.gpuTypes.find((g) => g.id === GPU_TYPE);
  if (!gpu) throw new Error(`GPU type not found: ${GPU_TYPE}`);
  const hourly = gpu.uninterruptablePrice ?? 0.34;
  if (hourly > limits.maxGpuHourlyPrice) {
    throw new Error(`GPU hourly ${hourly} exceeds MAX_GPU_HOURLY_PRICE ${limits.maxGpuHourlyPrice}`);
  }
  console.log('SELECTED_GPU', { id: gpu.id, displayName: gpu.displayName, hourly });

  // Tiny base64 launcher fetches full bootstrap from R2 (avoids huge env + quoting issues).
  const fetchPyB64 = readFileSync(path.join(ROOT, 'scripts/cloud/fetch-bootstrap.py')).toString(
    'base64',
  );
  const dockerStartCmd = [
    'set -euo pipefail; python3 -m pip install -q boto3; echo "$DDP_FETCH_PY_B64" | base64 -d > /tmp/fetch-bootstrap.py; exec python3 /tmp/fetch-bootstrap.py',
  ];

  let podId: string | null = null;
  const startedAt = Date.now();
  const summary: Record<string, unknown> = {
    gpuTypeId: GPU_TYPE,
    imageName: IMAGE,
    hourlyUsd: hourly,
    hardCeilingUsd: HARD_CEILING_USD,
    paidGpuStarted: false,
    terminated: false,
  };

  const terminate = async (why: string) => {
    if (!podId) return;
    try {
      await client.terminatePod(podId);
      summary.terminated = true;
      summary.terminateReason = why;
      console.log('POD_TERMINATED', { podId, why });
    } catch (e) {
      summary.terminateError = String((e as Error).message || e).slice(0, 300);
      console.error('POD_TERMINATE_FAILED', summary.terminateError);
    }
  };

  process.on('SIGINT', () => {
    void terminate('SIGINT').finally(() => process.exit(130));
  });
  process.on('SIGTERM', () => {
    void terminate('SIGTERM').finally(() => process.exit(143));
  });

  try {
    console.log('=== CREATE PAID POD (explicit approval) ===');
    let created: { podId: string; costPerHr: number | null } | null = null;
    // Prefer COMMUNITY for ~$0.34/hr 4090; fall back to SECURE if needed within hourly cap.
    const cloudAttempts: Array<'COMMUNITY' | 'SECURE'> = ['COMMUNITY', 'SECURE'];
    let lastErr: unknown = null;
    for (const cloudType of cloudAttempts) {
      try {
        console.log('CREATE_ATTEMPT', { cloudType, imageName: IMAGE, gpuTypeId: GPU_TYPE });
        created = await client.createPodForBenchmark({
          name: `ddp-first-gpu-bench-${Date.now()}`,
          imageName: IMAGE,
          gpuTypeId: GPU_TYPE,
          confirmPaidLaunch: true,
          cloudType,
          containerDiskInGb: 50,
          volumeInGb: 20,
          dockerEntrypoint: ['/bin/bash', '-lc'],
          dockerStartCmd,
          env: {
            CLOUD_RENDER_ENABLED: 'true',
            ALLOW_PAID_GPU_LAUNCH: 'true',
            ALLOW_WORKER_SELF_TERMINATE: 'true',
            IDLE_SHUTDOWN_MINUTES: String(limits.idleShutdownMinutes),
            MAX_JOB_RUNTIME_MINUTES: String(limits.maxJobRuntimeMinutes),
            BENCH_PREFIX,
            DDP_FETCH_PY_B64: fetchPyB64,
            R2_BUCKET: trimEnv('R2_BUCKET'),
            R2_ENDPOINT: trimEnv('R2_ENDPOINT'),
            R2_ACCESS_KEY_ID: trimEnv('R2_ACCESS_KEY_ID'),
            R2_SECRET_ACCESS_KEY: trimEnv('R2_SECRET_ACCESS_KEY'),
            R2_REGION: trimEnv('R2_REGION') || 'auto',
            RUNPOD_API_KEY: trimEnv('RUNPOD_API_KEY'),
            NVIDIA_DRIVER_CAPABILITIES: 'compute,utility,graphics',
          },
        });
        summary.cloudType = cloudType;
        summary.costPerHrObserved = created.costPerHr;
        break;
      } catch (e) {
        lastErr = e;
        const msg = String((e as Error).message || e);
        console.error('CREATE_FAILED', { cloudType, message: msg.slice(0, 300) });
        if (!/resources|capacity|try a different|no longer any|GPU_PRICE_EXCEEDED|exceeds MAX_GPU/i.test(msg)) {
          throw e;
        }
        await sleep(5000);
      }
    }
    if (!created) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    podId = created.podId;
    summary.podId = podId;
    summary.paidGpuStarted = true;
    summary.launchedAt = new Date().toISOString();
    console.log('POD_CREATED', { podId });
    writeFileSync(path.join(OUT_DIR, 'launch.json'), JSON.stringify(summary, null, 2));

    let complete = false;
    let missingPolls = 0;
    while (Date.now() - startedAt < MAX_WAIT_MS) {
      const uptimeSec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      const est = estimateCost(uptimeSec, hourly);
      summary.uptimeSec = uptimeSec;
      summary.estimatedCostUsd = est;

      let podStatus = 'UNKNOWN';
      try {
        const pod = await client.getPod(podId);
        podStatus = pod?.desiredStatus || 'MISSING';
        summary.podStatus = podStatus;
        summary.costPerHrObserved = pod?.costPerHr ?? hourly;
        if (pod?.runtime?.uptimeInSeconds != null) {
          summary.runtimeUptimeSec = pod.runtime.uptimeInSeconds;
        }
      } catch (e) {
        summary.podPollError = String((e as Error).message || e).slice(0, 200);
      }

      const existsFn = (storage as { exists?: (k: string) => Promise<boolean> }).exists;
      if (existsFn) {
        complete = await existsFn(`${BENCH_PREFIX}/results/COMPLETE`);
        summary.heartbeat = await existsFn(`${BENCH_PREFIX}/results/heartbeat.txt`);
        if (summary.heartbeat && storage.readObject) {
          try {
            const hb = Buffer.from(
              await storage.readObject(`${BENCH_PREFIX}/results/heartbeat.txt`),
            ).toString('utf8');
            summary.heartbeatText = hb.trim().slice(0, 200);
          } catch {
            /* ignore */
          }
        }
      }
      console.log('POLL', {
        uptimeSec,
        est,
        podStatus,
        complete,
        heartbeat: summary.heartbeat,
        heartbeatText: summary.heartbeatText,
        missingPolls,
      });

      if (est >= HARD_CEILING_USD) {
        await terminate('hard_ceiling');
        summary.failed = 'HARD_CEILING_REACHED';
        break;
      }
      if (complete) {
        await terminate('benchmark_complete_marker');
        break;
      }
      if (podStatus === 'EXITED' || podStatus === 'TERMINATED') {
        if (existsFn) complete = await existsFn(`${BENCH_PREFIX}/results/COMPLETE`);
        summary.selfTerminated = true;
        // Give uploads a moment if worker just finished.
        if (!complete) await sleep(10_000);
        if (existsFn) complete = await existsFn(`${BENCH_PREFIX}/results/COMPLETE`);
        break;
      }
      if (podStatus === 'MISSING') {
        missingPolls += 1;
        // If R2 heartbeat is alive, keep waiting — GraphQL/REST can briefly omit pods.
        const heartbeatAlive = Boolean(summary.heartbeat);
        const missingLimit = heartbeatAlive ? 40 : 12; // ~10min with hb, ~3min without
        if (missingPolls >= missingLimit) {
          if (existsFn) complete = await existsFn(`${BENCH_PREFIX}/results/COMPLETE`);
          summary.selfTerminated = true;
          summary.failed = complete ? undefined : 'POD_DISAPPEARED_NO_RESULTS';
          await terminate('pod_missing');
          break;
        }
      } else {
        missingPolls = 0;
      }
      await sleep(POLL_MS);
    }

    if (!complete && !summary.terminated && !summary.selfTerminated) {
      await terminate('timeout');
      summary.failed = 'TIMEOUT';
    }

    // Fetch results if present
    try {
      const reportKey = `${BENCH_PREFIX}/results/gpu-benchmark-report.json`;
      const logKey = `${BENCH_PREFIX}/results/bootstrap.log`;
      const mp4Key = `${BENCH_PREFIX}/results/shot.mp4`;
      const existsFn = (storage as { exists?: (k: string) => Promise<boolean> }).exists;
      if (existsFn && (await existsFn(reportKey))) {
        await downloadResult(storage as any, reportKey, path.join(OUT_DIR, 'gpu-benchmark-report.json'));
        summary.reportDownloaded = true;
        const report = JSON.parse(readFileSync(path.join(OUT_DIR, 'gpu-benchmark-report.json'), 'utf8'));
        summary.gpuReport = report;
      }
      if (existsFn && (await existsFn(logKey))) {
        await downloadResult(storage as any, logKey, path.join(OUT_DIR, 'bootstrap.log'));
        summary.logDownloaded = true;
      }
      if (existsFn && (await existsFn(mp4Key))) {
        await downloadResult(storage as any, mp4Key, path.join(OUT_DIR, 'shot.mp4'));
        summary.mp4Downloaded = true;
      }
    } catch (e) {
      summary.resultFetchError = String((e as Error).message || e).slice(0, 300);
    }

    // Final cost estimate
    const finalUptime = Number(summary.runtimeUptimeSec || summary.uptimeSec || 0);
    summary.finalEstimatedCostUsd = estimateCost(finalUptime, hourly);
    summary.finishedAt = new Date().toISOString();

    // Comparison vs CPU baselines
    const gpuWall = Number((summary.gpuReport as any)?.wallMs || 0);
    const cpuFinalRepMs = 127436;
    const cpuDiagnostic10sMs = 746000;
    const userMentionedCpuMin = 29;
    summary.comparison = {
      cpuFinalRep1sMs: cpuFinalRepMs,
      cpuDiagnostic10sMs,
      userMentionedCpuMinutes: userMentionedCpuMin,
      gpuFinalRep1sMs: gpuWall || null,
      speedupVsCpuFinalRep1s: gpuWall ? Number((cpuFinalRepMs / gpuWall).toFixed(2)) : null,
      projectedGpuMinutesFor29MinCpuWorkload: gpuWall
        ? Number(((userMentionedCpuMin * 60 * 1000 * gpuWall) / cpuFinalRepMs / 60000).toFixed(2))
        : null,
      note:
        'Projection assumes similar EEVEE workload mix; setup/download time is excluded from speedup ratio when using wallMs from on-pod report.',
    };

    writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log('=== BENCHMARK SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    // Verify pod gone
    await sleep(3000);
    try {
      const pod = await client.getPod(podId!);
      summary.verifyPodGone = !pod || pod.desiredStatus === 'TERMINATED' || pod.desiredStatus === 'EXITED';
      console.log('VERIFY_POD', { status: pod?.desiredStatus ?? 'GONE', gone: summary.verifyPodGone });
    } catch {
      summary.verifyPodGone = true;
      console.log('VERIFY_POD', { status: 'GONE' });
    }
    writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

    if (!(summary.gpuReport as any)?.ok) {
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('BENCHMARK_FAILED', String((e as Error).message || e).replace(/\brpa_[A-Za-z0-9]+/g, '[REDACTED]'));
    await terminate('error');
    summary.error = String((e as Error).message || e).slice(0, 500);
    writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  }
}

main();
