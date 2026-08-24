'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  CAPABILITY_SCHEMA,
  CAPABILITY_SCHEMA_V1,
  CHARACTER_JOB_KINDS,
  FINAL_1080P_RENDER,
  ENTRYPOINT_VERSION,
  GOAT_CHARACTER_ID,
  DEPARTMENT_STAGE_COUNT,
  STUDIO_BLENDER,
} = require('./character-job-kinds');

function readDepartmentStageCount(repoHint) {
  const candidates = [
    path.join(repoHint, 'blender/characters/common/stages.py'),
    path.join(repoHint, 'scripts/blender/characters/common/stages.py'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const tuple = text.match(/BUILD_STAGES\s*=\s*\(([\s\S]*?)\)/);
    if (!tuple) continue;
    const stages = [...tuple[1].matchAll(/"([A-Z0-9_]+)"/g)].map((item) => item[1]);
    const unique = stages.filter((name, index) => stages.indexOf(name) === index);
    if (unique.includes('CHARACTER_MASTER_GATE')) return unique.length;
  }
  return DEPARTMENT_STAGE_COUNT;
}

function firstExisting(paths) {
  return paths.find((file) => fs.existsSync(file)) || null;
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function filesPresent(root) {
  const characterMaster = firstExisting([
    path.join(root, 'src/character-master.js'),
    path.join(root, 'workers/runpod-blender/src/character-master.js'),
  ]);
  const characterMaterializer = firstExisting([
    path.join(root, 'src/character-source-materialize.js'),
    path.join(root, 'workers/runpod-blender/src/character-source-materialize.js'),
  ]);
  const downloadGate = firstExisting([
    path.join(root, 'src/character-download-gate.js'),
    path.join(root, 'workers/runpod-blender/src/character-download-gate.js'),
  ]);
  const streamHash = firstExisting([
    path.join(root, 'src/character-stream-hash.js'),
    path.join(root, 'workers/runpod-blender/src/character-stream-hash.js'),
  ]);
  const characterBuilder = firstExisting([
    path.join(root, 'blender/characters/build_character.py'),
    path.join(root, 'scripts/blender/characters/build_character.py'),
  ]);
  const executeModule = firstExisting([
    path.join(root, 'blender/characters/execute.py'),
    path.join(root, 'scripts/blender/characters/execute.py'),
  ]);
  const ioModule = firstExisting([
    path.join(root, 'blender/characters/common/io.py'),
    path.join(root, 'scripts/blender/characters/common/io.py'),
  ]);
  const departmentStages = firstExisting([
    path.join(root, 'blender/characters/common/stages.py'),
    path.join(root, 'scripts/blender/characters/common/stages.py'),
  ]);
  return {
    characterMaster,
    characterMaterializer,
    downloadGate,
    streamHash,
    characterBuilder,
    executeModule,
    ioModule,
    departmentStages,
  };
}

function liveImplementationComplete(baked) {
  const master = readText(baked.characterMaster);
  const materializer = readText(baked.characterMaterializer);
  const gate = readText(baked.downloadGate);
  const io = readText(baked.ioModule);
  const execute = readText(baked.executeModule);
  const builder = readText(baked.characterBuilder);
  const unconditionalForbid =
    /if \(allowReal\) \{\s*return fail\(\s*'REAL_GOAT_DOWNLOAD_FORBIDDEN'/s.test(materializer);
  const alwaysDryRun = /args\.push\('---dry-run'\)/.test(master) || /'--dry-run',\s*\]/.test(master);
  const masterInvokesAuthorizedDownload =
    master.includes('downloadAuthorizedGoatSource(') && master.includes('performNetworkDownload: true');
  const liveDispatch = master.includes("'--execute'") && master.includes('resolveExecutionMode');
  const executeFlag = io.includes('--execute') && io.includes('mutually exclusive');
  const executeImpl =
    execute.includes('def execute_department') &&
    (execute.includes('simulated=False') || execute.includes('"simulated": False') || execute.includes('executed_stage'));
  const wired = builder.includes('execute_department') && builder.includes('--execute');
  const gateComplete =
    gate.includes('evaluateRealDownloadAuthorization') &&
    gate.includes('permitsRealSourceDownload') &&
    gate.includes('authorizedImageDigest');
  return {
    unconditionalForbid,
    alwaysDryRun,
    liveDispatch,
    executeFlag,
    executeImpl,
    wired,
    gateComplete,
    masterInvokesAuthorizedDownload,
    streamPresent: Boolean(baked.streamHash),
  };
}

function compileCharacterCapability(input = {}) {
  const root = input.root || process.cwd();
  const baked = filesPresent(root);
  const stageCount = readDepartmentStageCount(root);
  const live = liveImplementationComplete(baked);
  const departmentBaked =
    Boolean(baked.characterBuilder && baked.departmentStages) && stageCount === DEPARTMENT_STAGE_COUNT;
  const liveCapable =
    departmentBaked &&
    live.liveDispatch &&
    live.executeFlag &&
    live.executeImpl &&
    live.wired &&
    !live.alwaysDryRun;
  const realDownloadCodeBaked = Boolean(baked.characterMaterializer && baked.streamHash && baked.downloadGate);
  const authorizedDownloadCapable =
    realDownloadCodeBaked && live.gateComplete && !live.unconditionalForbid && live.masterInvokesAuthorizedDownload;
  return {
    schema: CAPABILITY_SCHEMA,
    previousSchema: CAPABILITY_SCHEMA_V1,
    sourceCommit: input.sourceCommit || process.env.DDP_SOURCE_COMMIT || 'unknown',
    digest: input.digest || process.env.DDP_IMAGE_DIGEST || null,
    architecture: input.architecture || 'linux/amd64',
    blenderVersion: input.blenderVersion || process.env.BLENDER_VERSION || STUDIO_BLENDER,
    supportedJobKinds: [...CHARACTER_JOB_KINDS, FINAL_1080P_RENDER],
    characterMasterCapable: true,
    supportedCharacterMaterializer: GOAT_CHARACTER_ID,
    characterDepartmentStageCount: stageCount,
    entrypointVersion: ENTRYPOINT_VERSION,
    buildTimestamp: input.buildTimestamp || process.env.DDP_WORKER_BUILD_TIME || new Date().toISOString(),
    goatMaterializerBaked: Boolean(baked.characterMaterializer),
    characterDepartmentBaked: departmentBaked,
    characterMasterEntrypointBaked: Boolean(baked.characterMaster),
    liveCharacterDepartmentCapable: liveCapable,
    realSourceDownloadCodeBaked: realDownloadCodeBaked,
    authorizedRealSourceDownloadCapable: authorizedDownloadCapable,
    defaultExecutionMode: 'dry-run',
    mandatoryDryRun: live.alwaysDryRun,
    requiresPaidAuthorization: true,
    sourceWritesForbidden: true,
    syntheticLivePathVerified:
      input.syntheticLivePathVerified === true || (liveCapable && authorizedDownloadCapable),
    realGoatSourceTested: false,
    realGoatSourceBaked: false,
    credentialsBaked: false,
    goatProductionReady: false,
  };
}

function rejectCapabilityV1ForLive(capability) {
  if (!capability || capability.schema === CAPABILITY_SCHEMA_V1) {
    return {
      ok: false,
      code: 'WORKER_CAPABILITY_V1_FORBIDDEN_FOR_LIVE',
      reason: 'Capability V1 only proves files were copied into an image. It is not live-execution capable.',
    };
  }
  if (capability.schema !== CAPABILITY_SCHEMA) {
    return {
      ok: false,
      code: 'WORKER_CAPABILITY_SCHEMA_REJECTED',
      reason: 'Live character execution requires TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V2.',
    };
  }
  if (capability.liveCharacterDepartmentCapable !== true || capability.mandatoryDryRun === true) {
    return {
      ok: false,
      code: 'WORKER_NOT_LIVE_CHARACTER_CAPABLE',
      reason: 'Pinned worker is not live character-department capable.',
    };
  }
  if (capability.authorizedRealSourceDownloadCapable !== true || capability.requiresPaidAuthorization !== true) {
    return {
      ok: false,
      code: 'WORKER_NOT_AUTHORIZATION_GATED',
      reason: 'Pinned worker cannot perform authorization-gated real source download.',
    };
  }
  return { ok: true, code: 'OK' };
}

function writeCharacterCapability(file, input = {}) {
  const payload = compileCharacterCapability(input);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

if (require.main === module) {
  const writeAt = process.argv.includes('--write')
    ? process.argv[process.argv.indexOf('--write') + 1]
    : '/opt/ddp-worker/character-capability.json';
  const root = process.argv.includes('--root')
    ? process.argv[process.argv.indexOf('--root') + 1]
    : process.cwd();
  const payload = writeCharacterCapability(writeAt, { root });
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

module.exports = {
  compileCharacterCapability,
  writeCharacterCapability,
  filesPresent,
  rejectCapabilityV1ForLive,
};
