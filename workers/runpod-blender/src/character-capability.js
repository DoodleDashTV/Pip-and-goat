'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  CAPABILITY_SCHEMA,
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

function filesPresent(root) {
  return {
    characterMaster: Boolean(
      firstExisting([
        path.join(root, 'src/character-master.js'),
        path.join(root, 'workers/runpod-blender/src/character-master.js'),
      ]),
    ),
    characterMaterializer: Boolean(
      firstExisting([
        path.join(root, 'src/character-source-materialize.js'),
        path.join(root, 'workers/runpod-blender/src/character-source-materialize.js'),
      ]),
    ),
    characterBuilder: Boolean(
      firstExisting([
        path.join(root, 'blender/characters/build_character.py'),
        path.join(root, 'scripts/blender/characters/build_character.py'),
      ]),
    ),
    departmentStages: Boolean(
      firstExisting([
        path.join(root, 'blender/characters/common/stages.py'),
        path.join(root, 'scripts/blender/characters/common/stages.py'),
      ]),
    ),
  };
}

function compileCharacterCapability(input = {}) {
  const root = input.root || process.cwd();
  const baked = filesPresent(root);
  const stageCount = readDepartmentStageCount(root);
  return {
    schema: CAPABILITY_SCHEMA,
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
    goatMaterializerBaked: baked.characterMaterializer,
    characterDepartmentBaked: baked.characterBuilder && baked.departmentStages && stageCount === DEPARTMENT_STAGE_COUNT,
    characterMasterEntrypointBaked: baked.characterMaster,
    realGoatSourceBaked: false,
    credentialsBaked: false,
    goatProductionReady: false,
  };
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

module.exports = { compileCharacterCapability, writeCharacterCapability, filesPresent };
