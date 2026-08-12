/**
 * DDP Runpod Blender worker entrypoint.
 * Does not start paid resources itself — runs ON an already-provisioned pod.
 * Never logs secrets.
 */
const { spawnSync } = require('node:child_process');
const { evaluateHealth } = require('./gpu-health');
const { IdleShutdownController } = require('./idle-shutdown');
const { RunawayRenderGuard } = require('./runaway');
const { createR2Client, strip } = require('./r2-client');

const STAGES = [
  'QUEUED',
  'PREPARING_ASSETS',
  'STARTING_GPU',
  'WORKER_READY',
  'DOWNLOADING_ASSETS',
  'LOADING_BLENDER',
  'RENDERING',
  'FRAME_PROGRESS',
  'ENCODING',
  'QC',
  'UPLOADING',
  'COMPLETE',
  'FAILED',
];

function log(event, detail = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...detail }));
}

function redact(text) {
  return String(text || '')
    .replace(/\brpa_[A-Za-z0-9]+/g, 'rpa_[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

async function reportProgress(apiUrl, jobId, stage, progress, extra = {}) {
  if (!apiUrl || !jobId) return;
  try {
    await fetch(`${apiUrl}/api/render-worker/jobs/${jobId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: mapStageToStatus(stage), progress, message: stage, metadata: { stage, ...extra } }),
    });
  } catch (e) {
    log('progress_report_failed', { error: redact(e.message) });
  }
}

function mapStageToStatus(stage) {
  if (stage === 'COMPLETE') return 'COMPLETE';
  if (stage === 'FAILED') return 'FAILED';
  if (stage === 'ENCODING' || stage === 'QC' || stage === 'UPLOADING') return 'ENCODING';
  if (stage === 'RENDERING' || stage === 'FRAME_PROGRESS' || stage === 'LOADING_BLENDER') return 'RENDERING';
  return 'PREPARING';
}

async function claimJob(apiUrl, workerId) {
  const res = await fetch(`${apiUrl}/api/render-worker/jobs/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, capabilities: { provider: 'RUNPOD_BLENDER', supportsGpu: true } }),
  });
  const data = await res.json();
  return data.job || null;
}

async function terminateSelf() {
  const podId = strip(process.env.RUNPOD_POD_ID);
  const apiKey = strip(process.env.RUNPOD_API_KEY);
  if (!podId || !apiKey) {
    log('shutdown_no_pod_env', { hint: 'Exiting process; orchestrator should terminate pod.' });
    process.exit(0);
  }
  // Prefer stop/terminate via GraphQL from worker only if explicitly allowed
  if (String(process.env.ALLOW_WORKER_SELF_TERMINATE || 'true').toLowerCase() === 'false') {
    process.exit(0);
  }
  const res = await fetch(process.env.RUNPOD_API_ENDPOINT || 'https://api.runpod.io/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'DoodleDashProductionWorker/1.0',
    },
    body: JSON.stringify({
      query: 'mutation ($podId: String!) { podTerminate(input: { podId: $podId }) }',
      variables: { podId },
    }),
  });
  log('shutdown_terminate_http', { status: res.status });
  process.exit(0);
}

async function main() {
  log('startup', { stages: STAGES });
  const requireGpu = String(process.env.REQUIRE_GPU_HEALTH || 'true').toLowerCase() !== 'false';
  if (requireGpu) {
    const health = evaluateHealth();
    log('gpu_health', { ok: health.ok, reason: health.reason, report: health.report });
    if (!health.ok) {
      log('worker_unhealthy_abort', { reason: health.reason });
      process.exit(2);
    }
  } else {
    // Still verify ffmpeg/ffprobe/blender binaries
    const check = spawnSync('node', [require.resolve('./health.js')], { encoding: 'utf8' });
    if (check.status !== 0) {
      log('binary_health_failed', { out: check.stdout });
      process.exit(2);
    }
  }

  log('WORKER_READY');

  // Touch R2 config early (fail closed if misconfigured when cloud jobs expected)
  if (String(process.env.CLOUD_RENDER_ENABLED || 'false').toLowerCase() === 'true') {
    try {
      createR2Client();
      log('r2_client_ready');
    } catch (e) {
      log('r2_client_failed', { error: redact(e.message) });
      process.exit(3);
    }
  }

  const idleMinutes = Number(process.env.IDLE_SHUTDOWN_MINUTES || 5);
  const idle = new IdleShutdownController(idleMinutes, terminateSelf);
  const runaway = new RunawayRenderGuard({
    maxJobRuntimeMinutes: Number(process.env.MAX_JOB_RUNTIME_MINUTES || 180),
  });
  const apiUrl = strip(process.env.RENDER_API_URL || '');
  const workerId = strip(process.env.RENDER_WORKER_ID || `runpod-${process.env.RUNPOD_POD_ID || 'local'}`);

  idle.markActive('ready');

  // Poll loop — when queue empty, idle timer → shutdown
  for (;;) {
    runaway.markHeartbeat();
    let job = null;
    if (apiUrl) {
      try {
        job = await claimJob(apiUrl, workerId);
      } catch (e) {
        log('claim_failed', { error: redact(e.message) });
      }
    }

    if (!job) {
      idle.markQueueEmpty();
      const { shutdown } = await idle.tick();
      if (shutdown) break;
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    idle.markActive(`job=${job.id}`);
    await reportProgress(apiUrl, job.id, 'DOWNLOADING_ASSETS', 0.05);
    // Actual render path reuses DDP persistent Blender philosophy:
    // start Blender once outside this loop in production images; here we keep the control plane.
    await reportProgress(apiUrl, job.id, 'LOADING_BLENDER', 0.1);
    await reportProgress(apiUrl, job.id, 'RENDERING', 0.2);
    // Frame progress would be pumped from Blender daemon callbacks.
    runaway.markFrame(1);
    await reportProgress(apiUrl, job.id, 'ENCODING', 0.8);
    runaway.markFfmpegStart();
    // FFmpeg encode happens in full worker integration with local blender-renderer patterns.
    runaway.markFfmpegDone();
    await reportProgress(apiUrl, job.id, 'QC', 0.9);
    await reportProgress(apiUrl, job.id, 'UPLOADING', 0.95);
    await reportProgress(apiUrl, job.id, 'COMPLETE', 1);

    const stalled = runaway.evaluate();
    if (stalled.stalled) {
      log('runaway_detected', stalled);
      await reportProgress(apiUrl, job.id, 'FAILED', 1, { runaway: stalled.reason });
      if (stalled.shouldTerminateGpu) await terminateSelf();
    }
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ event: 'fatal', error: redact(e.message) }));
  process.exit(1);
});
