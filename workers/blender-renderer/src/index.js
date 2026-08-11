#!/usr/bin/env node

const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const DEFAULT_CAPABILITIES = {
  engines: ['EEVEE', 'CYCLES'],
  resolutions: ['270x480', '360x640', '540x960', '720x1280', '1080x1920'],
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
  storageRoot: process.env.OBJECT_STORAGE_ROOT || path.resolve(process.cwd(), '.doodle-dash-storage'),
};

let s3Client = null;

function getS3() {
  if (s3Client) return s3Client;
  const provider = (process.env.OBJECT_STORAGE_PROVIDER || 'local').toLowerCase();
  if (!['s3', 'r2', 'b2', 'minio'].includes(provider)) return null;
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3-compatible storage selected but credentials/bucket incomplete');
  }
  s3Client = {
    bucket,
    client: new S3Client({
      region: process.env.OBJECT_STORAGE_REGION || process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT || undefined,
      forcePathStyle:
        String(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE || '').toLowerCase() === 'true' ||
        Boolean(process.env.OBJECT_STORAGE_ENDPOINT),
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return s3Client;
}

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
    const outputDir = path.join(config.workspaceDir, jobId, 'output');
    await runBlender(job, localAssets, outputDir);
    await reportProgress(jobId, 'ENCODING', 85, 'Uploading render outputs.');
    const outputs = await uploadOutputs(job, outputDir);
    await postJson(`/jobs/${encodeURIComponent(jobId)}/complete`, { workerId: config.workerId, outputs });
  } catch (error) {
    await failJob(jobId, normalizeError(error));
  }
}

async function downloadAssets(job) {
  const assets = Array.isArray(job.payload && job.payload.assets) ? job.payload.assets : [];
  const jobId = job.id || job.queueId;
  const destRoot = path.join(config.workspaceDir, jobId, 'assets');
  await fsp.mkdir(destRoot, { recursive: true });
  const local = [];
  for (const [index, asset] of assets.entries()) {
    const uri = asset.uri || asset.storageLocation || '';
    const safeName = path.basename(uri || asset.id || `asset-${index}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const localPath = path.join(destRoot, `${index}-${safeName}`);
    await downloadUri(uri, localPath, asset.checksum);
    local.push({
      ...asset,
      role: asset.id || asset.role || 'other',
      localPath,
      downloaded: true,
    });
    const progress = 10 + Math.floor(((index + 1) / Math.max(assets.length, 1)) * 10);
    await reportProgress(jobId, 'PREPARING', progress, `Downloaded ${index + 1}/${assets.length} assets`);
  }
  return local;
}

async function downloadUri(uri, localPath, expectedChecksum) {
  if (!uri) throw new Error('Asset URI missing');
  await fsp.mkdir(path.dirname(localPath), { recursive: true });

  if (uri.startsWith('local://')) {
    const key = uri.slice('local://'.length);
    const src = path.join(config.storageRoot, key);
    await fsp.copyFile(src, localPath);
  } else if (uri.startsWith('file://')) {
    await fsp.copyFile(uri.slice('file://'.length), localPath);
  } else if (uri.startsWith('/') || uri.startsWith('.')) {
    await fsp.copyFile(uri, localPath);
  } else if (uri.startsWith('s3://') || uri.startsWith('http://') || uri.startsWith('https://')) {
    const s3 = getS3();
    if (!s3) throw new Error(`Cannot download ${uri}: S3 storage not configured`);
    let key = uri;
    if (uri.startsWith('s3://')) {
      const without = uri.slice('s3://'.length);
      const slash = without.indexOf('/');
      key = slash >= 0 ? without.slice(slash + 1) : without;
    } else if (process.env.OBJECT_STORAGE_PUBLIC_BASE_URL && uri.startsWith(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL)) {
      key = uri.slice(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, '').length + 1);
    } else {
      // path-style endpoint URL: http://host/bucket/key
      const bucket = s3.bucket;
      const marker = `/${bucket}/`;
      const idx = uri.indexOf(marker);
      key = idx >= 0 ? uri.slice(idx + marker.length) : path.basename(uri);
    }
    const out = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }));
    const bytes = Buffer.from(await out.Body.transformToByteArray());
    await fsp.writeFile(localPath, bytes);
  } else {
    throw new Error(`Unsupported asset URI scheme: ${uri}`);
  }

  if (expectedChecksum) {
    const actual = sha256File(localPath);
    if (actual !== expectedChecksum) {
      throw new Error(`Checksum mismatch for ${uri}: expected ${expectedChecksum}, got ${actual}`);
    }
  }
}

async function runBlender(job, localAssets, outputDir) {
  await fsp.mkdir(outputDir, { recursive: true });
  const argv = buildBlenderArgs(job, localAssets, outputDir);
  await reportProgress(job.id || job.queueId, 'RENDERING', 30, `Blender start: ${path.basename(argv[4] || 'assemble')}`);
  await new Promise((resolve, reject) => {
    const child = spawn(config.blenderBin, argv, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Blender exited with code ${code}`));
    });
  });
  // Encode shot.mp4 from frames for easier episode assembly
  const frames = (await fsp.readdir(outputDir))
    .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
    .sort();
  if (frames.length) {
    const fps = String(job.fps || 30);
    const mp4Path = path.join(outputDir, 'shot.mp4');
    const pattern = path.join(outputDir, 'frame_%04d.png');
    // Blender may write frame_0001.png or frame_1.png — detect
    const sample = frames[0];
    const padded = /frame_\d{4}\.png$/.test(sample);
    const ffmpegArgs = padded
      ? ['-y', '-framerate', fps, '-i', pattern, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4Path]
      : [
          '-y',
          '-framerate',
          fps,
          '-pattern_type',
          'glob',
          '-i',
          path.join(outputDir, 'frame_*.png'),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          '18',
          mp4Path,
        ];
    const enc = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf8' });
    if (enc.status !== 0) {
      console.warn('ffmpeg shot encode warning:', enc.stderr?.slice(-500));
    }
  } else {
    throw new Error('Blender completed but produced no frames');
  }
}

function buildBlenderArgs(job, localAssets, outputDir) {
  const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '../../..');
  const assembleScript = path.join(repoRoot, 'scripts/blender/assemble_scene.py');
  const payload = job.payload || {};
  const resolution = job.resolution || '540x960';
  const fps = String(job.fps || 30);
  const engine = job.engine || 'EEVEE';
  const meta = payload.metadata || {};
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
    '--start-frame',
    String(meta.startFrame || 1),
    '--end-frame',
    String(meta.endFrame || Math.max(1, Math.round((meta.durationSec || 2) * (job.fps || 30)))),
    '--samples',
    String(meta.samples || (resolution === '1080x1920' ? 32 : 16)),
    '--camera-preset',
    String(meta.cameraPreset || 'WIDE'),
    '--shot-meta-json',
    JSON.stringify(meta.shotMeta || meta || {}),
  ];
}

async function uploadOutputs(job, outputDir) {
  const jobId = job.id || job.queueId;
  const files = (await fsp.readdir(outputDir)).filter((f) => f.endsWith('.png') || f.endsWith('.mp4') || f.endsWith('.json'));
  const outputs = [];
  for (const file of files) {
    const full = path.join(outputDir, file);
    const bytes = await fsp.readFile(full);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const key = `draft-renders/worker-jobs/${jobId}/${file}`;
    const uri = await putObject(key, bytes, file.endsWith('.png') ? 'image/png' : 'application/octet-stream');
    outputs.push({
      kind: file.endsWith('.png') ? 'frames' : file.endsWith('.mp4') ? 'final' : 'metadata',
      uri,
      checksum,
      resolution: job.resolution || null,
      metadata: {
        file,
        bytes: bytes.length,
        uploaded: true,
      },
    });
  }
  return outputs;
}

async function putObject(key, bytes, contentType) {
  const provider = (process.env.OBJECT_STORAGE_PROVIDER || 'local').toLowerCase();
  if (provider === 'local' || provider === 'none' || provider === 'missing') {
    const full = path.join(config.storageRoot, key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, bytes);
    return `local://${key}`;
  }
  const s3 = getS3();
  if (!s3) throw new Error('No storage backend available for upload');
  await s3.client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
  if (process.env.OBJECT_STORAGE_PUBLIC_BASE_URL) {
    return `${process.env.OBJECT_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
  if (process.env.OBJECT_STORAGE_ENDPOINT) {
    return `${process.env.OBJECT_STORAGE_ENDPOINT.replace(/\/$/, '')}/${s3.bucket}/${key}`;
  }
  return `s3://${s3.bucket}/${key}`;
}

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
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
  console.error(error);
  process.exitCode = 1;
});
