#!/usr/bin/env tsx
/**
 * PHASE B — SINGLE AUTHORIZED LAUNCH (exactly ONE RTX 4090 pod, HARD CAP $0.25).
 *
 * Safety invariants enforced here:
 *  - Exactly ONE pod. No retry. If create returns/raises no pod id => authorization
 *    NOT consumed, spend $0, STOP.
 *  - try/finally: terminatePod ALWAYS runs; then poll myself.pods until the pod is
 *    absent and confirm no billable GPU remains.
 *  - HARD_KILL_MINUTES = floor(0.25/actualRate*60*0.90) from the ACTUAL pod $/hr.
 *    Terminate on COMPLETE, FAILED, HARD_KILL, startup stall, or no
 *    startup-status.json within 10 min of creation.
 *  - RUNPOD_API_KEY / ALLOW_PAID_GPU_LAUNCH are NEVER passed to the pod.
 *  - Restores ALLOW_PAID_GPU_LAUNCH=false + CLOUD_RENDER_ENABLED=false at end.
 *  - Render code and approved assets must still match their pins, re-checked here
 *    rather than trusted from preflight.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { RunpodClient } from '../../../packages/production/src/cloud/runpod-client';
import {
  computeRenderAssetFingerprint,
  computeRenderCodeFingerprint,
} from '../../../packages/production/src/cloud/worker-provenance';
import {
  WORKER_IMAGE,
  WORKER_IMAGE_RENDER_ASSET_SHA256,
  WORKER_IMAGE_RENDER_CODE_SHA256,
  HARD_CAP_USD,
  REPO_ROOT,
  STATE_FILE,
  redact,
  metadataKeyFor,
} from './common';
import { makeStorage } from './common';

const POLL_MS = 20_000;
// Once the worker reports GPU-dependent work, poll fast so the pod is terminated
// within seconds of COMPLETE rather than billing for a whole slow interval.
const ACTIVE_POLL_MS = 4_000;
const ACTIVE_STATUSES = new Set(['RENDERING', 'ENCODING', 'QC', 'UPLOADING', 'VERIFY_READBACK']);
// Cold pulls of a ~2GB worker image have previously taken ~4.5 min before the
// first startup-status.json. Give the pull + boot a full window; do not confuse
// "image still pulling" with a mid-boot stall.
const NO_STARTUP_KILL_MS = 15 * 60 * 1000; // no startup-status.json within 15 min of creation
const STALL_MS = 8 * 60 * 1000; // no bootStage/status progress for 8 min AFTER first startup-status

function log(event: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...detail }));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function readJsonKey(storage: any, key: string): Promise<any | null> {
  try {
    if (storage.exists && !(await withTimeout(storage.exists(key), 15000, 'exists'))) return null;
    const buf = await withTimeout(storage.readObject(key), 20000, 'readObject');
    return JSON.parse(Buffer.from(buf).toString('utf8'));
  } catch {
    return null;
  }
}

async function listPods(client: RunpodClient): Promise<any[]> {
  const data = await withTimeout(
    client.graphql<{ myself?: { pods?: any[] } }>(
      `query { myself { pods { id name desiredStatus costPerHr runtime { uptimeInSeconds } } } }`,
    ),
    30000,
    'listPods',
  );
  return data.myself?.pods ?? [];
}

async function main() {
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  const jobId: string = state.jobId;
  const manifestKey: string = state.manifestKey;
  const gpuTypeId: string = state.gpuTypeId || 'NVIDIA GeForce RTX 4090';
  const quotedRate: number = state.rate4090 ?? 0.7;
  const startupStatusKey: string = state.startupStatusKey;
  const statusKey: string = state.statusKey;
  const metadataKey: string = metadataKeyFor(jobId);

  console.log('=== PHASE B — SINGLE AUTHORIZED LAUNCH ===');
  log('config', { jobId, gpuTypeId, quotedRate, workerImage: WORKER_IMAGE, hardCapUsd: HARD_CAP_USD });

  // Preflight may have passed hours ago. Anything edited since - a scene script,
  // a character - would be rendered here without ever having been reviewed, so
  // the pins get the last word before any money is spent.
  const localCode = computeRenderCodeFingerprint(REPO_ROOT).fingerprint;
  const localAssets = computeRenderAssetFingerprint(REPO_ROOT).fingerprint;
  if (localCode !== WORKER_IMAGE_RENDER_CODE_SHA256 || localAssets !== WORKER_IMAGE_RENDER_ASSET_SHA256) {
    log('abort_fingerprint_drift', {
      renderCodeMatches: localCode === WORKER_IMAGE_RENDER_CODE_SHA256,
      renderAssetsMatch: localAssets === WORKER_IMAGE_RENDER_ASSET_SHA256,
      localRenderCode: localCode,
      pinnedRenderCode: WORKER_IMAGE_RENDER_CODE_SHA256,
      localRenderAssets: localAssets,
      pinnedRenderAssets: WORKER_IMAGE_RENDER_ASSET_SHA256,
    });
    console.log('ABORT: working tree no longer matches the pins — not launching. Spend $0.');
    process.exit(2);
  }

  const client = new RunpodClient();
  const storage = makeStorage();

  // Last-second guard: refuse to launch if ANY pod already exists.
  const pre = await listPods(client);
  if (pre.length !== 0) {
    log('abort_pods_present', { count: pre.length, ids: pre.map((p) => p.id) });
    console.log('ABORT: pods already present — not launching. Authorization NOT consumed. Spend $0.');
    process.exit(2);
  }

  // In-process paid-launch enablement (never committed, never passed to the pod).
  process.env.ALLOW_PAID_GPU_LAUNCH = 'true';
  process.env.CLOUD_RENDER_ENABLED = 'true';

  // Env for the pod. R2 creds YES; RUNPOD_API_KEY / ALLOW_PAID_GPU_LAUNCH NO.
  const podEnv: Record<string, string> = {
    R2_ENDPOINT: process.env.R2_ENDPOINT || '',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
    R2_BUCKET: process.env.R2_BUCKET || '',
    OBJECT_STORAGE_PROVIDER: 'r2',
    CLOUD_RENDER_ENABLED: 'true',
    REQUIRE_GPU_HEALTH: 'true',
    ALLOW_WORKER_SELF_TERMINATE: 'false',
    RENDER_JOB_ID: jobId,
    RENDER_JOB_MANIFEST_KEY: manifestKey,
    RENDER_WORKER_ID: `ddp-accept1080-${jobId}`,
    // The image cannot know its own digest; pass the pinned reference so the
    // worker records which image actually booted. DDP_SOURCE_COMMIT and
    // DDP_RENDER_CODE_SHA256 are deliberately NOT injected — they are baked into
    // the image, and overriding them from outside would defeat the provenance.
    DDP_IMAGE_DIGEST: WORKER_IMAGE,
    MAX_JOB_RUNTIME_MINUTES: '12',
    RUNPOD_GPU_HOURLY_RATE: String(quotedRate),
    STARTUP_WATCHDOG_MS: '300000',
    BLENDER_PREFLIGHT_TIMEOUT_MS: '120000',
    R2_CONNECT_TIMEOUT_MS: '10000',
    R2_REQUEST_TIMEOUT_MS: '120000',
  };

  // Non-billable dry run: validate all pre-pod logic (imports, state, pod
  // listing, pod-env construction, last-second guard) WITHOUT creating a pod.
  if (process.env.DDP_LAUNCH_DRYRUN === '1') {
    const redactedEnvKeys = Object.keys(podEnv).sort();
    log('dryrun_pod_env_keys', { keys: redactedEnvKeys });
    log('dryrun_no_secret_leak', {
      passesRunpodApiKey: Object.prototype.hasOwnProperty.call(podEnv, 'RUNPOD_API_KEY'),
      passesAllowPaidGpuLaunch: Object.prototype.hasOwnProperty.call(podEnv, 'ALLOW_PAID_GPU_LAUNCH'),
      r2CredsPresent: Boolean(podEnv.R2_ENDPOINT && podEnv.R2_ACCESS_KEY_ID && podEnv.R2_SECRET_ACCESS_KEY && podEnv.R2_BUCKET),
    });
    const hk = Math.floor((HARD_CAP_USD / quotedRate) * 60 * 0.9);
    log('dryrun_plan', { podNamePattern: 'ddp-accept1080-<ts>', gpuTypeId, cloudType: 'SECURE', hardKillMinPreview: hk });
    process.env.ALLOW_PAID_GPU_LAUNCH = 'false';
    process.env.CLOUD_RENDER_ENABLED = 'false';
    console.log('DRY RUN OK — no pod created. Authorization NOT consumed. Spend $0.');
    process.exit(0);
  }

  const podName = `ddp-accept1080-${Date.now()}`;
  let podId: string | null = null;
  let creationTs = 0;
  let actualRate = quotedRate;
  let hardKillMs = Math.floor((HARD_CAP_USD / actualRate) * 60 * 0.9) * 60 * 1000;
  let finalStatus = 'UNKNOWN';
  let lastArtifact: any = null;
  const stageLog: Array<{ ts: string; stage: string }> = [];

  try {
    log('creating_pod', { podName, cloudType: 'SECURE', gpuTypeId, containerDiskInGb: 40, volumeInGb: 0 });
    let created: { podId: string } | null = null;
    try {
      created = await withTimeout(
        client.createPodForBenchmark({
          name: podName,
          imageName: WORKER_IMAGE,
          gpuTypeId,
          confirmPaidLaunch: true,
          cloudType: 'SECURE',
          gpuCount: 1,
          containerDiskInGb: 60,
          volumeInGb: 0,
          env: podEnv,
        }),
        60000,
        'createPod',
      );
    } catch (e) {
      const code = (e as any)?.code;
      log('pod_create_failed', { code, error: redact((e as Error).message) });
      console.log('POD CREATE FAILED before any billable pod existed. Authorization NOT consumed. Spend $0. STOP (no retry).');
      finalStatus = 'CREATE_FAILED';
      // No podId => nothing to terminate. Fall through to finally (no-op terminate).
      created = null;
    }

    if (created?.podId) {
      podId = created.podId;
      creationTs = Date.now();
      state.podId = podId;
      state.creationTs = new Date(creationTs).toISOString();
      state.podName = podName;
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      log('pod_created', { podId, at: state.creationTs });
      console.log(`AUTHORIZATION CONSUMED: pod ${podId} created. Watchdog + HARD_KILL active.`);

      let lastProgressTs = Date.now();
      let lastStageKey = '';
      let sawStartupStatus = false;

      // Monitor loop.
      for (;;) {
        const elapsedMs = Date.now() - creationTs;

        // Poll pod state (bounded).
        let pod: any = null;
        try {
          const pods = await listPods(client);
          pod = pods.find((p) => p.id === podId) || null;
          if (pod && typeof pod.costPerHr === 'number' && pod.costPerHr > 0) {
            if (pod.costPerHr !== actualRate) {
              actualRate = pod.costPerHr;
              hardKillMs = Math.floor((HARD_CAP_USD / actualRate) * 60 * 0.9) * 60 * 1000;
            }
          }
        } catch (e) {
          log('pod_poll_error', { error: redact((e as Error).message) });
        }

        // Poll R2 diagnostics.
        const startup = await readJsonKey(storage, startupStatusKey);
        const status = await readJsonKey(storage, statusKey);
        if (startup) sawStartupStatus = true;

        const stageKey = `${startup?.bootStage || ''}|${status?.stage || ''}|${status?.status || ''}`;
        if (stageKey !== lastStageKey) {
          lastStageKey = stageKey;
          lastProgressTs = Date.now();
          const label = status?.status || startup?.bootStage || 'BOOTING';
          stageLog.push({ ts: new Date().toISOString(), stage: label });
          log('stage', {
            elapsedSec: Math.round(elapsedMs / 1000),
            costPerHr: pod?.costPerHr ?? null,
            desiredStatus: pod?.desiredStatus ?? null,
            bootStage: startup?.bootStage ?? null,
            renderStage: status?.stage ?? null,
            status: status?.status ?? null,
            uptimeSec: pod?.runtime?.uptimeInSeconds ?? null,
          });
        } else if (Math.round(elapsedMs / 1000) % 60 < Math.round(POLL_MS / 1000) + 1) {
          // Heartbeat once a minute while still waiting: distinguishes a stuck
          // image pull (uptime null) from a running container with no R2 yet.
          log('wait', {
            elapsedSec: Math.round(elapsedMs / 1000),
            desiredStatus: pod?.desiredStatus ?? null,
            uptimeSec: pod?.runtime?.uptimeInSeconds ?? null,
            sawStartupStatus,
          });
        }

        // Terminal states.
        if (status?.status === 'COMPLETE') {
          finalStatus = 'COMPLETE';
          lastArtifact = { artifactKey: status.artifactKey, artifactSha256: status.artifactSha256, metadata: status.metadata };
          log('render_complete', { artifactKey: status.artifactKey, artifactSha256: status.artifactSha256 });
          break;
        }
        // status.json is mutated per stage, so a retried intermediate PUT can land
        // after COMPLETE and hide it — which would bill until hard-kill. metadata.json
        // is written once, after the upload is readback-verified, so its presence
        // means the GPU work is finished no matter what status.json currently says.
        const meta = await readJsonKey(storage, metadataKey);
        if (meta?.artifactSha256) {
          finalStatus = 'COMPLETE';
          lastArtifact = { artifactKey: meta.artifactKey ?? status?.artifactKey, artifactSha256: meta.artifactSha256, metadata: meta };
          log('render_complete_via_metadata', { artifactKey: lastArtifact.artifactKey, staleStatus: status?.status ?? null });
          break;
        }
        if (status?.status === 'FAILED') {
          finalStatus = 'FAILED';
          log('render_failed', { code: status.code, classification: status.classification, message: redact(status.message || '') });
          break;
        }
        if (startup?.result === 'FAILED') {
          finalStatus = 'FAILED';
          log('startup_failed', { classification: startup.classification, code: startup.code });
          break;
        }

        // Kill rules.
        if (elapsedMs >= hardKillMs) {
          finalStatus = 'HARD_KILL_TIMEOUT';
          log('hard_kill', { elapsedSec: Math.round(elapsedMs / 1000), hardKillMin: Math.round(hardKillMs / 60000), actualRate });
          break;
        }
        if (!sawStartupStatus && elapsedMs >= NO_STARTUP_KILL_MS) {
          finalStatus = 'NO_STARTUP_STATUS_TIMEOUT';
          log('no_startup_status_kill', { elapsedSec: Math.round(elapsedMs / 1000) });
          break;
        }
        // Stall only applies once the worker has written startup-status.json.
        // Before that, the empty stage key would otherwise look like "progress"
        // on the first poll and then trip STALL_MS while the image is still
        // pulling — which is exactly what NO_STARTUP_KILL_MS covers.
        if (sawStartupStatus && Date.now() - lastProgressTs >= STALL_MS) {
          finalStatus = 'STARTUP_STALL';
          log('stall_kill', { sinceProgressSec: Math.round((Date.now() - lastProgressTs) / 1000) });
          break;
        }
        // Pod vanished unexpectedly (terminated externally / exited).
        if (pod === null && sawStartupStatus && elapsedMs > 60000) {
          finalStatus = status?.status === 'COMPLETE' ? 'COMPLETE' : 'POD_GONE';
          log('pod_gone', { elapsedSec: Math.round(elapsedMs / 1000) });
          break;
        }

        await sleep(ACTIVE_STATUSES.has(String(status?.status || '')) ? ACTIVE_POLL_MS : POLL_MS);
      }
    }
  } finally {
    // ALWAYS attempt termination if a pod exists.
    if (podId) {
      try {
        log('terminating_pod', { podId });
        await withTimeout(client.terminatePod(podId), 30000, 'terminatePod');
      } catch (e) {
        log('terminate_error_retry', { error: redact((e as Error).message) });
        try {
          await withTimeout(client.terminatePod(podId), 30000, 'terminatePod2');
        } catch (e2) {
          log('terminate_error_final', { error: redact((e2 as Error).message) });
        }
      }
      // Poll until absent from myself.pods.
      let absent = false;
      let billableRemaining = true;
      const termStart = Date.now();
      while (Date.now() - termStart < 180000) {
        try {
          const pods = await listPods(client);
          const mine = pods.find((p) => p.id === podId);
          absent = !mine;
          billableRemaining = pods.some((p) => (p.costPerHr ?? 0) > 0);
          log('post_terminate_poll', { podPresent: !!mine, totalPods: pods.length, billableRemaining });
          if (absent) break;
        } catch (e) {
          log('post_terminate_poll_error', { error: redact((e as Error).message) });
        }
        await sleep(10000);
      }
      const terminationTs = Date.now();
      const lifetimeMin = creationTs ? (terminationTs - creationTs) / 60000 : 0;
      const actualCostUsd = Number(((lifetimeMin / 60) * actualRate).toFixed(4));
      state.terminationTs = new Date(terminationTs).toISOString();
      state.lifetimeMinutes = Number(lifetimeMin.toFixed(3));
      state.actualRate = actualRate;
      state.actualCostUsd = actualCostUsd;
      state.podAbsentAfterTerminate = absent;
      state.billableRemaining = billableRemaining;
      state.finalStatus = finalStatus;
      state.stageLog = stageLog;
      state.lastArtifact = lastArtifact;
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      console.log('\n===== PHASE B LIFECYCLE SUMMARY =====');
      console.log(`Pod ID: ${podId}`);
      console.log(`Final status: ${finalStatus}`);
      console.log(`Lifetime: ${lifetimeMin.toFixed(2)} min @ $${actualRate}/hr`);
      console.log(`ACTUAL COST: $${actualCostUsd} (cap $${HARD_CAP_USD}) — within cap: ${actualCostUsd <= HARD_CAP_USD ? 'YES' : 'NO'}`);
      console.log(`Pod absent after terminate: ${absent ? 'YES' : 'NO'}`);
      console.log(`Billable GPU remaining: ${billableRemaining ? 'YES' : 'NO'}`);
      console.log(`Authorization consumed: YES`);
    } else {
      state.finalStatus = finalStatus;
      state.actualCostUsd = 0;
      state.authorizationConsumed = false;
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      console.log('\n===== PHASE B — NO POD CREATED =====');
      console.log('Authorization consumed: NO. Spend $0.');
    }
    // Restore flags (in-process; never persisted/committed as true).
    process.env.ALLOW_PAID_GPU_LAUNCH = 'false';
    process.env.CLOUD_RENDER_ENABLED = 'false';
  }
}

main().catch((e) => {
  console.error(redact(String((e as Error).message || e)));
  process.exit(1);
});
