/**
 * DDP shared render core (pure, dependency-light).
 *
 * This module centralizes the production render logic that is common to BOTH
 * the local Blender renderer (workers/blender-renderer) and the Runpod GPU
 * worker (workers/runpod-blender), so the two do not diverge. It deliberately
 * imports only Node built-ins (no @aws-sdk) so it can be required from either
 * package. R2-specific orchestration lives in single-shot.js.
 *
 * Every function fails closed: it throws a tagged Error ({ code }) rather than
 * returning a partial/fake success. Callers must treat a thrown error as a
 * hard failure and must never report COMPLETE without a verified artifact.
 */
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MANIFEST_SCHEMA = 'ddp-cloud-job-manifest-v1';

function tagged(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** Parse "WxH" -> { width, height }. Throws on malformed. */
function parseResolution(resolution) {
  const m = /^(\d+)x(\d+)$/.exec(String(resolution || '').trim());
  if (!m) throw tagged(`Malformed resolution: ${resolution}`, 'MANIFEST_INVALID');
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Strictly validate a single-shot cloud job manifest. Rejects malformed or
 * incomplete manifests (fail closed). Returns the validated manifest.
 */
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw tagged('Manifest is not an object', 'MANIFEST_INVALID');
  }
  const require_ = (cond, msg) => {
    if (!cond) throw tagged(msg, 'MANIFEST_INVALID');
  };

  require_(manifest.schemaVersion === MANIFEST_SCHEMA, `schemaVersion must be ${MANIFEST_SCHEMA}`);
  require_(typeof manifest.jobId === 'string' && manifest.jobId.length > 0, 'jobId required');
  require_(
    typeof manifest.episodeId === 'string' || typeof manifest.sceneId === 'string',
    'episodeId or sceneId required',
  );
  require_(typeof manifest.renderMode === 'string' && manifest.renderMode.length > 0, 'renderMode (output target) required');
  parseResolution(manifest.resolution);
  require_(Number.isFinite(manifest.fps) && manifest.fps > 0, 'fps must be a positive number');

  const fr = manifest.frameRange;
  require_(
    fr && Number.isInteger(fr.start) && Number.isInteger(fr.end) && fr.start >= 1 && fr.end >= fr.start,
    'frameRange { start>=1, end>=start } required',
  );

  const eevee = manifest.eevee || manifest.blenderSettings;
  require_(eevee && typeof eevee === 'object', 'eevee/blenderSettings required');
  require_(typeof eevee.engine === 'string' && eevee.engine.length > 0, 'eevee.engine required');
  require_(Number.isInteger(eevee.samples) && eevee.samples > 0, 'eevee.samples must be a positive integer');
  require_(typeof manifest.blenderVersion === 'string' && manifest.blenderVersion.length > 0, 'blenderVersion required');

  require_(Array.isArray(manifest.expectedAssets) && manifest.expectedAssets.length > 0, 'expectedAssets required (non-empty)');
  manifest.expectedAssets.forEach((a, i) => {
    require_(a && typeof a === 'object', `expectedAssets[${i}] must be an object`);
    require_(typeof a.role === 'string' && a.role.length > 0, `expectedAssets[${i}].role required`);
    require_(typeof a.r2Key === 'string' && a.r2Key.length > 0, `expectedAssets[${i}].r2Key required`);
    require_(typeof a.sha256 === 'string' && /^[0-9a-f]{64}$/.test(a.sha256), `expectedAssets[${i}].sha256 must be a 64-hex digest`);
  });

  require_(typeof manifest.outputKey === 'string' && manifest.outputKey.length > 0, 'outputKey (output R2 destination) required');

  const limits = manifest.limits;
  require_(limits && typeof limits === 'object', 'limits required');
  require_(Number.isFinite(limits.maxRuntimeMinutes) && limits.maxRuntimeMinutes > 0, 'limits.maxRuntimeMinutes must be positive');
  require_(Number.isFinite(limits.maxCostUsd) && limits.maxCostUsd > 0, 'limits.maxCostUsd must be positive');

  require_(typeof manifest.createdAt === 'string' && manifest.createdAt.length > 0, 'createdAt required');

  // Secrets must never be embedded in a manifest.
  const asText = JSON.stringify(manifest);
  require_(!/rpa_[A-Za-z0-9]/.test(asText), 'manifest must not embed Runpod API key');
  require_(!/(secret_access_key|SecretAccessKey)\s*[":=]/.test(asText), 'manifest must not embed secret access key');

  return manifest;
}

/** Build the Blender CLI argv, mirroring the proven local renderer path. */
function buildBlenderArgv({ manifest, assets, outputDir, assembleScript }) {
  const { start, end } = manifest.frameRange;
  const eevee = manifest.eevee || manifest.blenderSettings;
  return [
    '--background',
    '--factory-startup',
    '--python',
    assembleScript,
    '--',
    '--scene-id',
    manifest.sceneId || manifest.episodeId || manifest.jobId,
    '--resolution',
    manifest.resolution,
    '--fps',
    String(manifest.fps),
    '--engine',
    eevee.engine,
    '--output-dir',
    outputDir,
    '--assets-json',
    JSON.stringify(assets),
    '--start-frame',
    String(start),
    '--end-frame',
    String(end),
    '--samples',
    String(eevee.samples),
    '--camera-preset',
    String((manifest.cameraState && manifest.cameraState.preset) || 'WIDE'),
    '--shot-meta-json',
    JSON.stringify(manifest.shotMeta || {}),
    '--lighting-state-json',
    JSON.stringify(manifest.lightingState || {}),
  ];
}

/** List rendered PNG frames in an output dir, sorted. */
async function listFrames(outputDir) {
  let entries = [];
  try {
    entries = await fsp.readdir(outputDir);
  } catch {
    return [];
  }
  return entries.filter((f) => f.startsWith('frame_') && f.endsWith('.png')).sort();
}

/**
 * Invoke Blender headless. runCommand is injectable for tests.
 * Fails closed if Blender is missing, exits non-zero, or produces no frames.
 */
async function renderWithBlender({
  blenderBin = 'blender',
  argv,
  outputDir,
  runCommand = defaultRunCommand,
  log = () => {},
}) {
  await fsp.mkdir(outputDir, { recursive: true });
  const version = runCommand(blenderBin, ['--version']);
  if (version.status !== 0) {
    throw tagged(`Blender executable not available: ${blenderBin}`, 'BLENDER_NOT_FOUND');
  }
  log('blender_start', { version: (version.stdout || '').split('\n')[0] });
  const res = runCommand(blenderBin, argv, { stdio: 'inherit' });
  if (res.status !== 0) {
    throw tagged(`Blender exited with code ${res.status}`, 'BLENDER_FAILED');
  }
  const frames = await listFrames(outputDir);
  if (frames.length === 0) {
    throw tagged('Blender completed but produced no frames', 'NO_FRAMES');
  }
  return frames;
}

/** Verify each frame file is non-empty; ensure the count meets the manifest. */
async function verifyFrames({ manifest, outputDir }) {
  const frames = await listFrames(outputDir);
  if (frames.length === 0) throw tagged('No frames to verify', 'NO_FRAMES');
  const expected = manifest.frameRange.end - manifest.frameRange.start + 1;
  if (frames.length < expected) {
    throw tagged(`Frame count ${frames.length} < expected ${expected}`, 'FRAME_COUNT_MISMATCH');
  }
  for (const f of frames) {
    const st = await fsp.stat(path.join(outputDir, f));
    if (st.size <= 0) throw tagged(`Empty frame: ${f}`, 'EMPTY_FRAME');
  }
  return frames;
}

/** Encode frames to an mp4 with ffmpeg. Fails closed if ffmpeg fails or no output. */
async function encodeVideo({
  outputDir,
  fps,
  mp4Path,
  runCommand = defaultRunCommand,
  ffmpegBin = 'ffmpeg',
}) {
  const frames = await listFrames(outputDir);
  if (frames.length === 0) throw tagged('No frames to encode', 'NO_FRAMES');
  const padded = /frame_\d{4}\.png$/.test(frames[0]);
  const args = padded
    ? ['-y', '-framerate', String(fps), '-i', path.join(outputDir, 'frame_%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4Path]
    : ['-y', '-framerate', String(fps), '-pattern_type', 'glob', '-i', path.join(outputDir, 'frame_*.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4Path];
  const enc = runCommand(ffmpegBin, args);
  if (enc.status !== 0) {
    throw tagged(`ffmpeg encode failed (status ${enc.status})`, 'FFMPEG_FAILED');
  }
  if (!fs.existsSync(mp4Path) || fs.statSync(mp4Path).size <= 0) {
    throw tagged('ffmpeg produced no/empty output', 'FFMPEG_FAILED');
  }
  return mp4Path;
}

/**
 * Validate the encoded output with ffprobe: resolution must match the manifest,
 * duration/frames must be > 0. Fails closed on mismatch. ffprobe is injectable.
 */
async function validateOutput({ manifest, mp4Path, runCommand = defaultRunCommand, ffprobeBin = 'ffprobe' }) {
  if (!fs.existsSync(mp4Path) || fs.statSync(mp4Path).size <= 0) {
    throw tagged('Output artifact missing or empty', 'OUTPUT_INVALID');
  }
  const probe = runCommand(ffprobeBin, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_read_frames',
    '-count_frames',
    '-of', 'json',
    mp4Path,
  ]);
  if (probe.status !== 0) {
    throw tagged('ffprobe failed on output', 'OUTPUT_INVALID');
  }
  let info;
  try {
    info = JSON.parse(probe.stdout || '{}');
  } catch {
    throw tagged('ffprobe output unparseable', 'OUTPUT_INVALID');
  }
  const stream = (info.streams || [])[0] || {};
  const { width, height } = parseResolution(manifest.resolution);
  if (Number(stream.width) !== width || Number(stream.height) !== height) {
    throw tagged(`Output resolution ${stream.width}x${stream.height} != ${manifest.resolution}`, 'OUTPUT_RESOLUTION_MISMATCH');
  }
  const frames = Number(stream.nb_read_frames);
  if (!Number.isFinite(frames) || frames <= 0) {
    throw tagged('Output has zero frames', 'OUTPUT_INVALID');
  }
  return { width, height, frames, bytes: fs.statSync(mp4Path).size };
}

function defaultRunCommand(bin, args, opts = {}) {
  return spawnSync(bin, args, { encoding: 'utf8', ...opts });
}

module.exports = {
  MANIFEST_SCHEMA,
  tagged,
  sha256Buffer,
  sha256File,
  parseResolution,
  validateManifest,
  buildBlenderArgv,
  listFrames,
  renderWithBlender,
  verifyFrames,
  encodeVideo,
  validateOutput,
  defaultRunCommand,
};
