'use strict';

/** Fail-closed FINAL 30s launch contract. No RunPod mutations. */

const { resolveProfile, ffmpegEncodeArgs, ffmpegHasUpscale } = require('./scenery-render-profiles');

const FINAL_SCRIPT = '/opt/ddp-worker/blender/scenery/cinematic_valley_world_v1.py';
const FINAL_ENTRY = 'node ./src/scenery-showcase-original14-entry.js';
const FORBIDDEN_CMDS = ['scenery-showcase-entry-v2.js', 'v7-proof-a-boot.js'];
const REQUIRED_HOST_RAM = 24 * 1024 * 1024 * 1024;
// Exact 24 GiB is 24576 MiB. nvidia-smi on a normal RTX 4090 reports ~24564 MiB
// (documented in worker_memory_contract_v1.py). The failed V2 pod used
// `Number(vramMiB) < 24576`, which rejects that class. Floor is 24500 MiB:
// 64 MiB below the documented 24564 reading, 4020 MiB above a 20 GiB GPU.
const DOCUMENTED_RTX4090_NVIDIA_SMI_TOTAL_MIB = 24564;
const REQUIRED_VRAM_MIB = 24500;
const REQUIRED_VRAM_COMPARISON = 'vramTotalMiB < REQUIRED_VRAM_MIB';
const REQUIRED_DISK = 60 * 1024 * 1024 * 1024;
const FINAL_TIMEOUT_MINUTES = 1440;

function strip(value) {
  return String(value || '').replace(/[\r\n]+/g, '').trim();
}

function buildBlenderArgs({ assetsJson = '[]', outputDir = '/tmp/out', proofPath = '/tmp/proof.json', progressPath = '/tmp/progress.json' } = {}) {
  return [
    '--background',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    FINAL_SCRIPT,
    '--',
    '--assets-json',
    assetsJson,
    '--output-dir',
    outputDir,
    '--resolution',
    '1080x1920',
    '--fps',
    '30',
    '--start-frame',
    '1',
    '--end-frame',
    '900',
    '--samples',
    '256',
    '--proof-path',
    proofPath,
    '--progress-path',
    progressPath,
    '--profile',
    'FINAL',
    '--water-variant',
    'D',
    '--hero-rebuild',
    'v3',
  ];
}

function assertFinalBlenderArgs(args) {
  const text = args.join(' ');
  const blockers = [];
  if (!text.includes(FINAL_SCRIPT)) blockers.push('WRONG_BLENDER_SCRIPT');
  if (!text.includes('--profile FINAL')) blockers.push('PROFILE_NOT_FINAL');
  if (!text.includes('--water-variant D')) blockers.push('WATER_VARIANT_NOT_D');
  if (!text.includes('--resolution 1080x1920')) blockers.push('RESOLUTION_NOT_NATIVE');
  if (!text.includes('--start-frame 1') || !text.includes('--end-frame 900')) blockers.push('FRAME_RANGE_NOT_1_900');
  if (!text.includes('--samples 256')) blockers.push('SAMPLES_NOT_256');
  if (!text.includes('--fps 30')) blockers.push('FPS_NOT_30');
  if (/eevee/i.test(text)) blockers.push('EEVEE_SELECTED');
  if (/water-variant C\b/.test(text)) blockers.push('WATER_C_FORBIDDEN');
  if (/scale=|lanczos/i.test(text)) blockers.push('UPSCALE_FORBIDDEN');
  if (blockers.length) {
    throw Object.assign(new Error(blockers.join(',')), { code: 'FINAL_LAUNCH_CONTRACT_FAILED', blockers });
  }
  return { ok: true, args };
}

function assertWorkerCmd(cmd) {
  const value = strip(cmd);
  if (value !== FINAL_ENTRY) {
    throw Object.assign(new Error(`worker cmd must be ${FINAL_ENTRY}`), { code: 'WRONG_WORKER_CMD' });
  }
  for (const bad of FORBIDDEN_CMDS) {
    if (value.includes(bad)) {
      throw Object.assign(new Error(`forbidden cmd ${bad}`), { code: 'FORBIDDEN_WORKER_CMD' });
    }
  }
  return { ok: true, cmd: value };
}

function resolveFinalWorkerEnv(env = {}) {
  const profile = resolveProfile({
    SCENERY_SHOWCASE_RENDER_PROFILE: 'FINAL',
    SCENERY_SHOWCASE_INTERNAL_RESOLUTION: '1080x1920',
    SCENERY_SHOWCASE_ALLOW_UPSCALE: 'false',
  });
  if (profile.id !== 'FINAL' || profile.resolution !== '1080x1920' || profile.engine !== 'CYCLES') {
    throw Object.assign(new Error('FINAL profile contract failed'), { code: 'FINAL_PROFILE_INVALID' });
  }
  if (strip(env.SCENERY_SHOWCASE_EEVEE_SAMPLES) && Number(env.SCENERY_SHOWCASE_EEVEE_SAMPLES) !== 256) {
    throw Object.assign(new Error('EEVEE sample override cannot change FINAL 256'), { code: 'FINAL_SAMPLE_OVERRIDE_FORBIDDEN' });
  }
  const encode = ffmpegEncodeArgs({ fps: 30, inputPattern: 'frame_%04d.png', outputPath: 'out.mp4', profile });
  if (ffmpegHasUpscale(encode)) {
    throw Object.assign(new Error('FINAL encode upscale forbidden'), { code: 'FINAL_UPSCALE_FORBIDDEN' });
  }
  const blenderMinutes = Number(env.SCENERY_SHOWCASE_BLENDER_TIMEOUT_MINUTES || FINAL_TIMEOUT_MINUTES);
  if (!Number.isFinite(blenderMinutes) || blenderMinutes < FINAL_TIMEOUT_MINUTES) {
    throw Object.assign(new Error('FINAL blender timeout must be >= 1440 minutes'), { code: 'TIMEOUT_BELOW_1440' });
  }
  return {
    profile,
    samples: 256,
    blenderMinutes,
    encode,
  };
}

function convertMib(mib) {
  const totalMiB = Number(mib);
  if (!Number.isFinite(totalMiB)) {
    throw Object.assign(new Error('VRAM MiB is not a number'), { code: 'GPU_TELEMETRY_MALFORMED' });
  }
  return {
    mib: totalMiB,
    gib: totalMiB / 1024,
    decimalGb: (totalMiB * 1024 * 1024) / 1e9,
  };
}

function parseNvidiaSmiTelemetry(stdout, { status = 0, stderr = '' } = {}) {
  if (Number(status) !== 0) {
    return { ok: false, code: 'GPU_TELEMETRY_MISSING', error: String(stderr || 'nvidia-smi failed').slice(0, 300) };
  }
  const line = String(stdout || '').trim().split('\n')[0] || '';
  if (!line) {
    return { ok: false, code: 'GPU_TELEMETRY_MISSING', error: 'empty nvidia-smi stdout' };
  }
  const parts = line.split(',').map((part) => part.trim());
  if (parts.length < 3) {
    return { ok: false, code: 'GPU_TELEMETRY_MALFORMED', error: 'nvidia-smi must report name,memory.total,memory.free', raw: line };
  }
  const gpuModel = parts[0];
  const vramTotalMiB = Number(parts[1]);
  const vramFreeMiB = Number(parts[2]);
  if (!gpuModel || !Number.isFinite(vramTotalMiB) || !Number.isFinite(vramFreeMiB) || vramTotalMiB <= 0) {
    return { ok: false, code: 'GPU_TELEMETRY_MALFORMED', error: 'ambiguous nvidia-smi fields', raw: line };
  }
  const total = Math.trunc(vramTotalMiB);
  const free = Math.trunc(vramFreeMiB);
  return {
    ok: true,
    gpuModel,
    vramTotalMiB: total,
    vramFreeMiB: free,
    vramMiB: total,
    units: 'MiB',
    converted: convertMib(total),
    raw: line,
  };
}

function vramTotalMiBFrom(row = {}) {
  const value = row.vramTotalMiB ?? row.vramMiB;
  return Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : NaN;
}

function assertHostResources({ memTotal = 0, vramMiB = 0, vramTotalMiB, diskFree = 0 } = {}) {
  const blockers = [];
  const totalMiB = vramTotalMiBFrom({ vramMiB, vramTotalMiB });
  if (Number(memTotal) < REQUIRED_HOST_RAM) blockers.push('HOST_RAM_BELOW_24GIB');
  if (!Number.isFinite(totalMiB)) blockers.push('GPU_TELEMETRY_MALFORMED');
  else if (totalMiB < REQUIRED_VRAM_MIB) blockers.push('VRAM_BELOW_24GIB');
  if (Number(diskFree) < REQUIRED_DISK) blockers.push('DISK_BELOW_60GIB');
  if (blockers.length) {
    throw Object.assign(new Error(blockers.join(',')), { code: 'FINAL_HOST_CONTRACT_FAILED', blockers });
  }
  return { ok: true, vramTotalMiB: totalMiB };
}

function assertBotaniqExcluded(selectedKeys = []) {
  const hit = selectedKeys.some((key) => /botaniq_full/i.test(String(key)));
  if (hit) {
    throw Object.assign(new Error('Botaniq Full cannot coexist with Original-14'), { code: 'BOTANIQ_FULL_EXCLUDED' });
  }
  return { ok: true };
}

function assertRtx4090({ gpuModel = '', vramMiB = 0, vramTotalMiB } = {}) {
  if (!/rtx\s*4090/i.test(String(gpuModel))) {
    throw Object.assign(new Error('RTX 4090 required'), { code: 'GPU_NOT_RTX_4090' });
  }
  const totalMiB = vramTotalMiBFrom({ vramMiB, vramTotalMiB });
  if (!Number.isFinite(totalMiB)) {
    throw Object.assign(new Error('GPU telemetry malformed'), { code: 'GPU_TELEMETRY_MALFORMED' });
  }
  if (totalMiB < REQUIRED_VRAM_MIB) {
    throw Object.assign(new Error('VRAM below RTX 4090 class floor'), { code: 'VRAM_BELOW_24GIB' });
  }
  return { ok: true, gpuModel, vramTotalMiB: totalMiB };
}

function assertZeroLivePods(livePods = []) {
  if (!Array.isArray(livePods) || livePods.length) {
    throw Object.assign(new Error('unexpected live pods'), { code: 'LIVE_PODS_NOT_EMPTY', livePods });
  }
  return { ok: true };
}

function assertNoAutomaticRetry({ retryCreate = false, createCount = 0 } = {}) {
  if (retryCreate || Number(createCount) > 1) {
    throw Object.assign(new Error('automatic second CREATE forbidden'), { code: 'AUTOMATIC_RETRY_CREATE_FORBIDDEN' });
  }
  return { ok: true };
}

function inspectFinalDockerfile(text) {
  const src = String(text || '');
  const cmdLines = src.split(/\r?\n/).filter((line) => /^\s*(CMD|ENTRYPOINT)\b/.test(line));
  const cmdText = cmdLines.join('\n');
  const blockers = [];
  if (!/CMD \["node", "\.\/src\/scenery-showcase-original14-entry\.js"\]/.test(src)) {
    blockers.push('CMD_NOT_ORIGINAL14_ENTRY');
  }
  if (/scenery-showcase-entry-v2\.js/.test(cmdText)) blockers.push('CONTAINS_V2_ENTRY');
  if (/v7-proof-a-boot\.js/.test(cmdText)) blockers.push('CONTAINS_V7_PROOF_A_BOOT');
  if (/SCENERY_SHOWCASE_RENDER_PROFILE=LOOKDEV/.test(src)) blockers.push('LOOKDEV_PROFILE_IN_FINAL_IMAGE');
  if (/SCENERY_SHOWCASE_EEVEE_SAMPLES=\d+/.test(src)) blockers.push('EEVEE_SAMPLES_IN_FINAL_IMAGE');
  if (/SCENERY_SHOWCASE_BLENDER_TIMEOUT_MINUTES=55/.test(src)) blockers.push('TIMEOUT_STILL_55');
  if (blockers.length) {
    throw Object.assign(new Error(blockers.join(',')), { code: 'FINAL_DOCKERFILE_CONTRACT_FAILED', blockers });
  }
  return { ok: true, cmd: FINAL_ENTRY };
}

module.exports = {
  FINAL_SCRIPT,
  FINAL_ENTRY,
  FORBIDDEN_CMDS,
  FINAL_TIMEOUT_MINUTES,
  REQUIRED_HOST_RAM,
  REQUIRED_VRAM_MIB,
  REQUIRED_VRAM_COMPARISON,
  DOCUMENTED_RTX4090_NVIDIA_SMI_TOTAL_MIB,
  REQUIRED_DISK,
  convertMib,
  parseNvidiaSmiTelemetry,
  buildBlenderArgs,
  assertFinalBlenderArgs,
  assertWorkerCmd,
  resolveFinalWorkerEnv,
  assertHostResources,
  assertBotaniqExcluded,
  assertRtx4090,
  assertZeroLivePods,
  assertNoAutomaticRetry,
  inspectFinalDockerfile,
};
