'use strict';

/** Exact-scene visual-proof contract. Never starts the 900-frame FINAL video. */

const { FINAL_SCRIPT, FINAL_ENTRY, FORBIDDEN_CMDS, assertWorkerCmd, assertHostResources, assertRtx4090, assertZeroLivePods, assertNoAutomaticRetry, assertBotaniqExcluded } = require('./final-launch-contract-v1');

const PREVIEW_FRAMES = Object.freeze([
  { shot: 'SHOT_01', frame: 48 },
  { shot: 'SHOT_02', frame: 210 },
  { shot: 'SHOT_03', frame: 360 },
  { shot: 'SHOT_04', frame: 520 },
  { shot: 'SHOT_05', frame: 680 },
  { shot: 'SHOT_06', frame: 860 },
]);
const HERO = Object.freeze({ shot: 'SHOT_02', frame: 210 });
const HARD_SPEND_USD = 0.50;
const USD_PER_HOUR = 0.74;
const HARD_RUNTIME_MINUTES = 40;
const AUTH_NAME = 'TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_AUTHORIZATION_V1';

function strip(value) {
  return String(value || '').replace(/[\r\n]+/g, '').trim();
}

function buildStillArgs({
  assetsJson = '[]',
  outputDir = '/tmp/out',
  proofPath = '/tmp/proof.json',
  progressPath = '/tmp/progress.json',
  resolution,
  samples,
  frame,
  profile,
} = {}) {
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
    resolution,
    '--fps',
    '30',
    '--start-frame',
    String(frame),
    '--end-frame',
    String(frame),
    '--samples',
    String(samples),
    '--engine',
    'CYCLES',
    '--proof-path',
    proofPath,
    '--progress-path',
    progressPath,
    '--profile',
    profile,
    '--water-variant',
    'D',
    '--hero-rebuild',
    'v3',
    '--stills-only',
    '--stills-frames',
    String(frame),
  ];
}

function buildPreviewArgs(opts = {}) {
  return buildStillArgs({
    ...opts,
    resolution: '540x960',
    samples: 32,
    frame: Number(opts.frame || HERO.frame),
    profile: 'LOOKDEV_FAST',
  });
}

function buildHeroArgs(opts = {}) {
  return buildStillArgs({
    ...opts,
    resolution: '1080x1920',
    samples: 256,
    frame: Number(opts.frame || HERO.frame),
    profile: 'HERO_STILL',
  });
}

function assertVisualProofArgs(args, { kind } = {}) {
  const text = args.join(' ');
  const blockers = [];
  if (!text.includes(FINAL_SCRIPT)) blockers.push('WRONG_BLENDER_SCRIPT');
  if (!text.includes('--water-variant D')) blockers.push('WATER_VARIANT_NOT_D');
  if (!text.includes('--engine CYCLES')) blockers.push('ENGINE_NOT_CYCLES');
  if (!text.includes('--stills-only')) blockers.push('STILLS_ONLY_REQUIRED');
  if (!text.includes('--hero-rebuild v3')) blockers.push('HERO_REBUILD_NOT_V3');
  if (/eevee/i.test(text)) blockers.push('EEVEE_SELECTED');
  if (/water-variant C\b/.test(text)) blockers.push('WATER_C_FORBIDDEN');
  if (/scale=|lanczos/i.test(text)) blockers.push('UPSCALE_FORBIDDEN');
  if (text.includes('--end-frame 900')) blockers.push('NINE_HUNDRED_FRAME_FORBIDDEN');
  if (kind === 'preview') {
    if (!text.includes('--resolution 540x960')) blockers.push('PREVIEW_RESOLUTION_NOT_540x960');
    if (!text.includes('--samples 32')) blockers.push('PREVIEW_SAMPLES_NOT_32');
    if (text.includes('--profile FINAL')) blockers.push('PREVIEW_MUST_NOT_BE_FINAL');
  }
  if (kind === 'hero') {
    if (!text.includes('--resolution 1080x1920')) blockers.push('HERO_RESOLUTION_NOT_NATIVE');
    if (!text.includes('--samples 256')) blockers.push('HERO_SAMPLES_NOT_256');
    if (!text.includes('--stills-frames 210')) blockers.push('HERO_FRAME_NOT_SHOT_02');
    if (Number(args[args.indexOf('--stills-frames') + 1]) < 151 || Number(args[args.indexOf('--stills-frames') + 1]) > 300) {
      blockers.push('SHOT_02_FRAME_OUT_OF_RANGE');
    }
  }
  if (blockers.length) {
    throw Object.assign(new Error(blockers.join(',')), { code: 'VISUAL_PROOF_CONTRACT_FAILED', blockers });
  }
  return { ok: true, args };
}

function isolatedProcessPlan() {
  const preview = PREVIEW_FRAMES.map((row) => ({
    kind: 'preview',
    shot: row.shot,
    frame: row.frame,
    resolution: '540x960',
    samples: 32,
    engine: 'CYCLES',
    denoise: true,
    isolatedBlender: true,
  }));
  const hero = {
    kind: 'hero',
    shot: HERO.shot,
    frame: HERO.frame,
    resolution: '1080x1920',
    samples: 256,
    engine: 'CYCLES',
    denoise: true,
    isolatedBlender: true,
  };
  return {
    processes: preview.length + 1,
    preview,
    hero,
    contactSheet: true,
    encode900: false,
  };
}

function assertVisualProofPlan(plan = isolatedProcessPlan()) {
  if (plan.processes !== 7) {
    throw Object.assign(new Error('visual proof must use 7 isolated Blender processes'), { code: 'VISUAL_PROOF_PROCESS_COUNT' });
  }
  if (plan.encode900) {
    throw Object.assign(new Error('visual proof must not encode 900 frames'), { code: 'NINE_HUNDRED_FRAME_FORBIDDEN' });
  }
  const shot02 = plan.preview.find((row) => row.shot === 'SHOT_02');
  if (!shot02 || shot02.frame < 151 || shot02.frame > 300) {
    throw Object.assign(new Error('SHOT_02 preview must be Camera C frames 151-300'), { code: 'SHOT_02_FRAME_OUT_OF_RANGE' });
  }
  return { ok: true, plan };
}

function spendCeiling() {
  const hours = HARD_RUNTIME_MINUTES / 60;
  const expectedUsd = Number((hours * USD_PER_HOUR).toFixed(4));
  if (expectedUsd > HARD_SPEND_USD) {
    throw Object.assign(new Error('runtime ceiling exceeds $0.50'), { code: 'SPEND_CEILING_INCONSISTENT' });
  }
  return {
    hardSpendUsd: HARD_SPEND_USD,
    usdPerHour: USD_PER_HOUR,
    hardRuntimeMinutes: HARD_RUNTIME_MINUTES,
    expectedUsdAtCeiling: expectedUsd,
    createCount: 1,
    retry: false,
    automaticSecondCreate: false,
  };
}

function assertImageInspection(inspect = {}) {
  const cmd = Array.isArray(inspect.Cmd) ? inspect.Cmd.join(' ') : strip(inspect.Cmd);
  const blockers = [];
  if (cmd !== 'node ./src/scenery-showcase-original14-entry.js' && cmd !== FINAL_ENTRY) {
    blockers.push('CMD_NOT_ORIGINAL14_ENTRY');
  }
  for (const bad of FORBIDDEN_CMDS) {
    if (String(inspect.Cmd || '').includes(bad) || String(inspect.Entrypoint || '').includes(bad)) {
      blockers.push(`FORBIDDEN_${bad}`);
    }
  }
  if (strip(inspect.WorkingDir) && strip(inspect.WorkingDir) !== '/opt/ddp-worker') {
    blockers.push('WORKINGDIR_NOT_OPT_DDP_WORKER');
  }
  if (inspect.digest && !/^sha256:[0-9a-f]{64}$/.test(strip(inspect.digest))) {
    blockers.push('DIGEST_NOT_IMMUTABLE');
  }
  if (blockers.length) {
    throw Object.assign(new Error(blockers.join(',')), { code: 'FINAL_IMAGE_INSPECT_FAILED', blockers });
  }
  return { ok: true };
}

module.exports = {
  PREVIEW_FRAMES,
  HERO,
  HARD_SPEND_USD,
  HARD_RUNTIME_MINUTES,
  AUTH_NAME,
  FINAL_ENTRY,
  buildPreviewArgs,
  buildHeroArgs,
  assertVisualProofArgs,
  isolatedProcessPlan,
  assertVisualProofPlan,
  spendCeiling,
  assertImageInspection,
  assertWorkerCmd,
  assertHostResources,
  assertRtx4090,
  assertZeroLivePods,
  assertNoAutomaticRetry,
  assertBotaniqExcluded,
};
