#!/usr/bin/env node

const { spawn, spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_CAPABILITIES = {
  engines: ['EEVEE', 'CYCLES'],
  resolutions: ['270x480', '360x640', '540x960', '1080x1920'],
  fps: [24, 30, 60],
  supportsGpu: Boolean(process.env.BLENDER_GPU),
  maxConcurrentJobs: 1,
};

const config = {
  apiUrl: stripTrailingSlash(process.env.RENDER_API_URL || 'http://localhost:3000/api/render-worker'),
  workerId: process.env.RENDER_WORKER_ID || `${os.hostname()}-${process.pid}`,
  workerName: process.env.RENDER_WORKER_NAME || `blender-${os.hostname()}`,
  blenderBin: process.env.BLENDER_BIN || 'blender',
  workspaceDir: process.env.RENDER_WORKSPACE_DIR || path.join(os.tmpdir(), 'doodle-dash-blender-renderer'),
  pollIntervalMs: Number(process.env.RENDER_POLL_INTERVAL_MS || 5000),
  once: process.argv.includes('--once'),
};

async function main() {
  await registerWorker();
  do {
    const job = await claimJob();
    if (!job) {
      if (config.once) return;
      await delay(config.pollIntervalMs);
      continue;
    }
    await processJob(job);
  } while (!config.once);
}

async function registerWorker() {
  await postJson('/workers/register', {
    id: config.workerId,
    name: config.workerName,
    capabilities: DEFAULT_CAPABILITIES,
  });
}

async function claimJob() {
  const response = await postJson('/jobs/claim', {
    workerId: config.workerId,
    capabilities: DEFAULT_CAPABILITIES,
  });
  return response && response.job ? response.job : null;
}

async function processJob(job) {
  const jobId = job.id || job.queueId;
  try {
    await reportProgress(jobId, 'PREPARING', 5, 'Claimed render job.');
    const localAssets = await downloadAssets(job);
    const blender = detectBlender(config.blenderBin);
    if (!blender.available) {
      await failJob(jobId, {
        status: 'FAILED',
        message: `Blender executable not found: ${config.blenderBin}`,
        type: 'BLENDER_MISSING',
        code: 'BLENDER_NOT_FOUND',
      });
      return;
    }

    await reportProgress(jobId, 'RENDERING', 20, 'Starting Blender headless render.');
    await runBlender(job, localAssets);
    await reportProgress(jobId, 'ENCODING', 85, 'Uploading render outputs.');
    const outputs = await uploadOutputs(job);
    await postJson(`/jobs/${encodeURIComponent(jobId)}/complete`, { workerId: config.workerId, outputs });
  } catch (error) {
    await failJob(jobId, normalizeError(error));
  }
}

async function downloadAssets(job) {
  const assets = Array.isArray(job.payload && job.payload.assets) ? job.payload.assets : [];
  await reportProgress(job.id || job.queueId, 'PREPARING', 10, `Asset download stub recorded ${assets.length} assets.`);
  return assets.map((asset) => ({
    ...asset,
    localPath: path.join(config.workspaceDir, job.id || job.queueId, path.basename(asset.uri || asset.id || 'asset')),
    downloaded: false,
    note: 'download stub; storage adapter not configured',
  }));
}

async function runBlender(job, localAssets) {
  const argv = buildBlenderArgs(job, localAssets);
  await reportProgress(job.id || job.queueId, 'RENDERING', 30, `Blender argv prepared: ${argv.join(' ')}`);
  await new Promise((resolve, reject) => {
    const child = spawn(config.blenderBin, argv, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Blender exited with code ${code}`));
    });
  });
}

function buildBlenderArgs(job, localAssets) {
  const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '../../..');
  const assembleScript = path.join(repoRoot, 'scripts/blender/assemble_scene.py');
  const payload = job.payload || {};
  const resolution = job.resolution || '540x960';
  const fps = String(job.fps || 30);
  const engine = job.engine || 'EEVEE';
  const outputDir = path.join(config.workspaceDir, job.id || job.queueId, 'output');
  return [
    '--background',
    '--factory-startup',
    '--python',
    assembleScript,
    '--',
    '--scene-id',
    payload.sceneId || job.id || job.queueId,
    '--resolution',
    resolution,
    '--fps',
    fps,
    '--engine',
    engine,
    '--output-dir',
    outputDir,
    '--assets-json',
    JSON.stringify(localAssets),
  ];
}

async function uploadOutputs(job) {
  const jobId = job.id || job.queueId;
  return [
    {
      kind: 'metadata',
      uri: `stub://render-outputs/${jobId}/metadata.json`,
      metadata: { uploaded: false, note: 'upload stub; object storage adapter not configured' },
    },
  ];
}

async function reportProgress(jobId, status, progress, message) {
  await postJson(`/jobs/${encodeURIComponent(jobId)}/progress`, {
    workerId: config.workerId,
    status,
    progress,
    message,
  });
}

async function failJob(jobId, error) {
  await postJson(`/jobs/${encodeURIComponent(jobId)}/fail`, {
    workerId: config.workerId,
    error,
  });
}

function detectBlender(binary) {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  return {
    available: !result.error && result.status === 0,
    version: result.stdout ? result.stdout.split('\n')[0] : undefined,
    error: result.error ? result.error.message : undefined,
  };
}

async function postJson(route, body) {
  const response = await fetch(`${config.apiUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data && data.message ? data.message : `HTTP ${response.status}`);
    error.status = response.status;
    error.response = data;
    throw error;
  }
  return data;
}

function normalizeError(error) {
  if (!error || typeof error !== 'object') {
    return { message: String(error), type: 'WORKER_ERROR' };
  }
  return {
    status: Number.isInteger(error.status) ? error.status : undefined,
    message: typeof error.message === 'string' ? error.message : 'Worker failed.',
    type: typeof error.type === 'string' ? error.type : 'WORKER_ERROR',
    code: typeof error.code === 'string' ? error.code : undefined,
  };
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(normalizeError(error));
  process.exitCode = 1;
});
