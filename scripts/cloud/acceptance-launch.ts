#!/usr/bin/env tsx
/**
 * FINAL_1080P acceptance render — PHASE B (SINGLE PAID POD).
 *
 * Creates EXACTLY ONE Runpod SECURE RTX 4090 pod that runs the digest-pinned
 * worker in single-shot mode against the pre-uploaded R2 manifest, monitors it
 * via R2 status files + live pod cost, and ALWAYS terminates the pod in a
 * finally block. Enforces a hard USD cap and a hard-kill deadline derived from
 * the ACTUAL live $/hr read back after creation.
 *
 * Safety invariants:
 *  - Never more than one pod; never an automatic paid retry.
 *  - Never passes RUNPOD_API_KEY or ALLOW_PAID_GPU_LAUNCH to the pod.
 *  - Never prints secret values.
 *  - terminatePod ALWAYS runs (finally + signal handlers), then confirms the pod
 *    is gone and no billable GPU remains.
 */
import { randomUUID } from 'node:crypto';
import {
  createObjectStorageFromConfig,
  resolveObjectStorageConfig,
} from '@doodle-dash/shared';
import { RunpodClient, type RunpodPodStatus } from '../../packages/production/src/cloud/runpod-client';
import { validateRunpodWorkerImageRef, resolveRunpodWorkerImage } from '../../packages/production/src/cloud/config';

const HARD_CAP_USD = Number(process.env.ACCEPT_HARD_CAP || 0.25);
const GPU_TYPE_ID = 'NVIDIA GeForce RTX 4090';
const CLOUD_TYPE: 'SECURE' | 'COMMUNITY' = (process.env.ACCEPT_CLOUD_TYPE as 'SECURE' | 'COMMUNITY') || 'SECURE';
const NO_STARTUP_STATUS_LIMIT_MIN = 10; // kill if no startup-status.json within 10 min of creation
const BOOT_STALL_MINUTES = Number(process.env.ACCEPT_BOOT_STALL_MIN || 8);
const POLL_MS = 20_000;

function nowIso() {
  return new Date().toISOString();
}
function log(event: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: nowIso(), event, ...detail }));
}
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_res, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function redact(s: string) {
  return String(s || '').replace(/\brpa_[A-Za-z0-9]+/g, '[REDACTED]');
}

async function readJsonFromR2(
  storage: ReturnType<typeof createObjectStorageFromConfig>,
  key: string,
): Promise<Record<string, unknown> | null> {
  try {
    if (!storage.readObject) return null;
    const bytes = await withTimeout(storage.readObject(key), 20_000, `r2 read ${key}`);
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function main() {
  const env = { ...process.env } as Record<string, string | undefined>;
  if (!env.OBJECT_STORAGE_PROVIDER && env.R2_BUCKET) env.OBJECT_STORAGE_PROVIDER = 'r2';

  const jobId = (env.ACCEPT_JOB_ID || '').trim();
  if (!jobId) throw new Error('ACCEPT_JOB_ID is required (from Phase A preflight).');

  const cfg = resolveObjectStorageConfig(env);
  if (cfg.provider !== 's3') throw new Error('R2/S3 provider not configured');
  const storage = createObjectStorageFromConfig(cfg);

  const manifestKey = `jobs/${jobId}/manifest.json`;
  const startupKey = `jobs/${jobId}/startup-status.json`;
  const statusKey = `jobs/${jobId}/status.json`;
  const metadataKey = `jobs/${jobId}/metadata.json`;

  const manifest = await readJsonFromR2(storage, manifestKey);
  if (!manifest) throw new Error(`Manifest not found in R2 at ${manifestKey}. Run Phase A first.`);
  const outputKey = String((manifest as { outputKey?: string }).outputKey || '');
  log('manifest_loaded', { manifestKey, outputKey, renderMode: (manifest as { renderMode?: string }).renderMode });

  const imageRef = resolveRunpodWorkerImage(env);
  const imageCheck = validateRunpodWorkerImageRef(imageRef);
  if (!imageCheck.ok) throw new Error(`Worker image gate failed: ${imageCheck.reason}`);

  // In-process paid-launch enablement ONLY (never written to .env).
  process.env.ALLOW_PAID_GPU_LAUNCH = 'true';
  process.env.CLOUD_RENDER_ENABLED = 'true';
  const clientEnv = { ...env, ALLOW_PAID_GPU_LAUNCH: 'true', CLOUD_RENDER_ENABLED: 'true' };
  const client = new RunpodClient({ env: clientEnv });

  // Safety: refuse to create if ANY pod already exists (guarantees exactly one).
  const preexisting = await withTimeout(client.listMyPods(), 30_000, 'list pods (pre)');
  if (preexisting.length > 0) {
    throw new Error(`Refusing to launch: ${preexisting.length} pod(s) already exist. Manual review required.`);
  }
  log('preflight_no_existing_pods', { count: 0 });

  if (String(env.ACCEPT_DRY_RUN || '') === '1') {
    log('dry_run_stop', { note: 'DRY RUN — validated env/R2/manifest/auth/listMyPods; NOT creating a pod.' });
    process.env.ALLOW_PAID_GPU_LAUNCH = 'false';
    process.env.CLOUD_RENDER_ENABLED = 'false';
    return;
  }

  // Worker env — R2 creds via env; NEVER RUNPOD_API_KEY / ALLOW_PAID_GPU_LAUNCH.
  const workerEnv: Record<string, string> = {
    R2_ENDPOINT: String(env.R2_ENDPOINT || ''),
    R2_ACCESS_KEY_ID: String(env.R2_ACCESS_KEY_ID || ''),
    R2_SECRET_ACCESS_KEY: String(env.R2_SECRET_ACCESS_KEY || ''),
    R2_BUCKET: String(env.R2_BUCKET || ''),
    R2_REGION: String(env.R2_REGION || 'auto'),
    OBJECT_STORAGE_PROVIDER: 'r2',
    CLOUD_RENDER_ENABLED: 'true',
    REQUIRE_GPU_HEALTH: 'true',
    ALLOW_WORKER_SELF_TERMINATE: 'false',
    RENDER_JOB_ID: jobId,
    RENDER_JOB_MANIFEST_KEY: manifestKey,
    MAX_JOB_RUNTIME_MINUTES: String(env.ACCEPT_MAX_RUNTIME_MINUTES || 18),
    // Conservative worst-case rate so the worker's own cost-aware runtime cap can
    // never exceed the USD cap even before the orchestrator reads the real rate.
    RUNPOD_GPU_HOURLY_RATE: String(env.ACCEPT_WORST_RATE || 0.74),
    STARTUP_WATCHDOG_MS: String(env.ACCEPT_STARTUP_WATCHDOG_MS || 300_000),
    RUNPOD_WORKER_IMAGE: imageRef,
    DDP_IMAGE_DIGEST: String(imageCheck.digest || ''),
  };

  const podName = `ddp-accept1080-${Date.now()}`;
  let podId: string | null = null;
  let terminated = false;
  let creationTs = 0;
  let actualRate = Number(env.ACCEPT_WORST_RATE || 0.74);
  let rateSource = 'worst-case-default';
  let hardKillMinutes = Math.floor((HARD_CAP_USD / actualRate) * 60 * 0.9);
  let lastPod: RunpodPodStatus | null = null;
  let outcome = 'UNKNOWN';
  let outcomeDetail: Record<string, unknown> = {};

  const terminateAndConfirm = async () => {
    if (!podId) return;
    if (terminated) return;
    terminated = true;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await withTimeout(client.terminatePod(podId), 30_000, 'terminatePod');
        log('terminate_requested', { podId, attempt });
        break;
      } catch (e) {
        log('terminate_error', { podId, attempt, error: redact((e as Error).message) });
        await sleep(3000 * attempt);
      }
    }
    // Confirm absence from myself.pods.
    let stillPresent = true;
    for (let i = 0; i < 15; i++) {
      await sleep(8000);
      let pods: RunpodPodStatus[] = [];
      try {
        pods = await withTimeout(client.listMyPods(), 30_000, 'list pods (confirm)');
      } catch (e) {
        log('confirm_list_error', { error: redact((e as Error).message) });
        continue;
      }
      const mine = pods.find((p) => p.id === podId);
      if (!mine) {
        stillPresent = false;
        log('terminate_confirmed_absent', { podId, remainingPods: pods.length });
        break;
      }
      lastPod = mine;
      log('terminate_confirm_wait', { podId, desiredStatus: mine.desiredStatus, costPerHr: mine.costPerHr, uptimeInSeconds: mine.uptimeInSeconds });
    }
    outcomeDetail.podStillPresentAfterTerminate = stillPresent;
  };

  const onSignal = (sig: string) => {
    log('signal_received', { sig });
    terminateAndConfirm().finally(() => process.exit(1));
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  try {
    log('creating_pod', { podName, gpuTypeId: GPU_TYPE_ID, cloudType: CLOUD_TYPE, image: imageRef });
    const created = await withTimeout(
      client.createPodForBenchmark({
        name: podName,
        imageName: imageRef,
        gpuTypeId: GPU_TYPE_ID,
        gpuCount: 1,
        cloudType: CLOUD_TYPE,
        confirmPaidLaunch: true,
        containerDiskInGb: 40,
        volumeInGb: 0,
        env: workerEnv,
      }),
      60_000,
      'createPodForBenchmark',
    );
    podId = created.podId;
    creationTs = Date.now();
    log('pod_created', { podId, creationTs: nowIso() });

    // Read back ACTUAL $/hr (retry — costPerHr can be null immediately).
    for (let i = 0; i < 10; i++) {
      await sleep(6000);
      let pods: RunpodPodStatus[] = [];
      try {
        pods = await withTimeout(client.listMyPods(), 30_000, 'list pods (rate)');
      } catch (e) {
        log('rate_list_error', { error: redact((e as Error).message) });
        continue;
      }
      const mine = pods.find((p) => p.id === podId);
      if (mine) {
        lastPod = mine;
        if (typeof mine.costPerHr === 'number' && mine.costPerHr > 0) {
          actualRate = mine.costPerHr;
          rateSource = 'runpod-live';
          break;
        }
        log('rate_pending', { podId, desiredStatus: mine.desiredStatus, gpu: mine.gpuDisplayName });
      }
    }
    hardKillMinutes = Math.floor((HARD_CAP_USD / actualRate) * 60 * 0.9);
    log('actual_rate', { actualRate, rateSource, hardKillMinutes, hardCapUsd: HARD_CAP_USD, gpu: lastPod?.gpuDisplayName });

    // Safety: never tolerate a GPU pricier than a 4090 secure rate.
    if (actualRate > 0.9) {
      outcome = 'RATE_TOO_HIGH';
      outcomeDetail = { actualRate };
      log('rate_too_high_abort', { actualRate });
      // finally will terminate.
      return;
    }

    // ── Monitor loop ──
    let lastStatus = '';
    let lastBootStage = '';
    let lastBootChangeTs = Date.now();
    for (;;) {
      const elapsedMin = (Date.now() - creationTs) / 60_000;

      // Hard-kill deadline.
      if (elapsedMin >= hardKillMinutes) {
        outcome = 'HARD_KILL_TIMEOUT';
        outcomeDetail = { elapsedMin: Number(elapsedMin.toFixed(2)), hardKillMinutes };
        log('hard_kill_timeout', outcomeDetail);
        break;
      }

      // Pod liveness + running cost.
      let mine: RunpodPodStatus | undefined;
      try {
        const pods = await withTimeout(client.listMyPods(), 30_000, 'list pods (monitor)');
        mine = pods.find((p) => p.id === podId);
        if (mine) lastPod = mine;
      } catch (e) {
        log('monitor_list_error', { error: redact((e as Error).message) });
      }
      const runningCost = (elapsedMin / 60) * actualRate;
      if (runningCost >= HARD_CAP_USD * 0.95) {
        outcome = 'COST_CAP_APPROACH';
        outcomeDetail = { runningCost: Number(runningCost.toFixed(4)), elapsedMin: Number(elapsedMin.toFixed(2)) };
        log('cost_cap_approach_kill', outcomeDetail);
        break;
      }

      // R2 status files.
      const startup = await readJsonFromR2(storage, startupKey);
      const status = await readJsonFromR2(storage, statusKey);

      const curStatus = status ? String(status.status || '') : '';
      if (curStatus && curStatus !== lastStatus) {
        log('status_transition', { from: lastStatus || '(none)', to: curStatus, stage: status?.stage });
        lastStatus = curStatus;
      }
      const curBoot = startup ? String(startup.bootStage || '') : '';
      if (curBoot && curBoot !== lastBootStage) {
        log('boot_transition', { from: lastBootStage || '(none)', to: curBoot });
        lastBootStage = curBoot;
        lastBootChangeTs = Date.now();
      }

      // Success / failure classification.
      if (curStatus === 'COMPLETE') {
        outcome = 'COMPLETE';
        outcomeDetail = { elapsedMin: Number(elapsedMin.toFixed(2)) };
        log('render_complete', outcomeDetail);
        break;
      }
      if (curStatus === 'FAILED') {
        outcome = 'RENDER_FAILED';
        outcomeDetail = { code: status?.code, classification: status?.classification, stage: status?.stage };
        log('render_failed', outcomeDetail);
        break;
      }
      if (startup && String(startup.result || '') === 'FAILED') {
        outcome = 'STARTUP_FAILED';
        outcomeDetail = { classification: startup.classification, code: startup.code };
        log('startup_failed', outcomeDetail);
        break;
      }

      // No startup-status within limit → stalled boot.
      if (!startup && elapsedMin >= NO_STARTUP_STATUS_LIMIT_MIN) {
        outcome = 'NO_STARTUP_STATUS';
        outcomeDetail = { elapsedMin: Number(elapsedMin.toFixed(2)), limitMin: NO_STARTUP_STATUS_LIMIT_MIN };
        log('no_startup_status_kill', outcomeDetail);
        break;
      }

      // Boot stalled (startup-status present but no stage progress) and no active render.
      const bootStallMin = (Date.now() - lastBootChangeTs) / 60_000;
      if (startup && !status && bootStallMin >= BOOT_STALL_MINUTES && elapsedMin >= BOOT_STALL_MINUTES) {
        outcome = 'BOOT_STALL';
        outcomeDetail = { bootStallMin: Number(bootStallMin.toFixed(2)), lastBootStage };
        log('boot_stall_kill', outcomeDetail);
        break;
      }

      // Pod vanished unexpectedly (not by us).
      if (!mine && elapsedMin > 1.5) {
        outcome = curStatus === 'COMPLETE' ? 'COMPLETE' : 'POD_VANISHED';
        outcomeDetail = { elapsedMin: Number(elapsedMin.toFixed(2)) };
        log('pod_vanished', outcomeDetail);
        break;
      }

      log('heartbeat', {
        elapsedMin: Number(elapsedMin.toFixed(2)),
        hardKillMinutes,
        runningCostUsd: Number(runningCost.toFixed(4)),
        podStatus: mine?.desiredStatus ?? 'unknown',
        uptimeSec: mine?.uptimeInSeconds ?? null,
        bootStage: lastBootStage || null,
        renderStatus: lastStatus || null,
      });
      await sleep(POLL_MS);
    }
  } catch (e) {
    outcome = 'ORCHESTRATOR_ERROR';
    outcomeDetail = { error: redact((e as Error).message) };
    log('orchestrator_error', outcomeDetail);
  } finally {
    await terminateAndConfirm();
  }

  // Final cost accounting.
  const lifetimeSec = lastPod?.uptimeInSeconds && lastPod.uptimeInSeconds > 0
    ? lastPod.uptimeInSeconds
    : Math.round((Date.now() - creationTs) / 1000);
  const lifetimeMin = Number((lifetimeSec / 60).toFixed(3));
  const actualCostUsd = Number(((lifetimeMin / 60) * actualRate).toFixed(4));

  // Confirm no billable pod remains.
  let remaining: RunpodPodStatus[] = [];
  try {
    remaining = await withTimeout(client.listMyPods(), 30_000, 'list pods (final)');
  } catch (e) {
    log('final_list_error', { error: redact((e as Error).message) });
  }
  const billableRemaining = remaining.filter((p) => p.id === podId || (p.desiredStatus === 'RUNNING'));

  // Restore in-process flags to safe defaults.
  process.env.ALLOW_PAID_GPU_LAUNCH = 'false';
  process.env.CLOUD_RENDER_ENABLED = 'false';

  const final = {
    phase: 'B_LAUNCH_COMPLETE',
    jobId,
    podId,
    podName,
    outcome,
    outcomeDetail,
    gpu: lastPod?.gpuDisplayName || GPU_TYPE_ID,
    cloudType: CLOUD_TYPE,
    actualRateUsdPerHr: actualRate,
    rateSource,
    hardKillMinutes,
    hardCapUsd: HARD_CAP_USD,
    lifetimeSeconds: lifetimeSec,
    lifetimeMinutes: lifetimeMin,
    actualCostUsd,
    withinCap: actualCostUsd <= HARD_CAP_USD,
    terminated,
    activeBillablePods: billableRemaining.length,
    totalPodsRemaining: remaining.length,
    outputKey,
    r2Keys: { manifestKey, startupKey, statusKey, metadataKey, outputKey },
  };
  console.log('\n===== ACCEPTANCE LAUNCH RESULT =====');
  console.log(JSON.stringify(final, null, 2));

  if (billableRemaining.length > 0) {
    console.error('WARNING: billable pod(s) may still remain — manual verification required.');
    process.exit(2);
  }
}

// Top-level guard: any unexpected throw still exits non-zero (pod termination is
// handled inside main's finally + signal handlers).
main().catch((e) => {
  console.error(redact(String((e as Error).message || e)));
  process.exit(1);
});
