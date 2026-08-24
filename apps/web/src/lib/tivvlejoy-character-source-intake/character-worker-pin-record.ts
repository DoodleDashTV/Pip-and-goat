import { readFileSync } from 'node:fs';
import path from 'node:path';

export const CHARACTER_WORKER_PIN_PATH = 'config/cloud/character-worker-image.json' as const;

export const FORBIDDEN_STALE_WORKER_DIGESTS = [
  'sha256:8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830',
  'sha256:b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed',
] as const;

export type CharacterWorkerPin = {
  schema: 'TIVVLEJOY_GOAT_CHARACTER_WORKER_IMAGE_PIN_V1';
  repository: 'ddp-runpod-blender';
  digest: string | null;
  ref: string | null;
  sourceCommit: string | null;
  architecture: 'linux/amd64';
  blenderVersion: '4.2.2';
  characterMasterCapable: true;
  goatMaterializerBaked: boolean | null;
  characterDepartmentBaked: boolean | null;
  stageCount: 26;
  jobKinds: readonly string[];
};

export function emptyCharacterWorkerPin(): CharacterWorkerPin {
  return {
    schema: 'TIVVLEJOY_GOAT_CHARACTER_WORKER_IMAGE_PIN_V1',
    repository: 'ddp-runpod-blender',
    digest: null,
    ref: null,
    sourceCommit: null,
    architecture: 'linux/amd64',
    blenderVersion: '4.2.2',
    characterMasterCapable: true,
    goatMaterializerBaked: null,
    characterDepartmentBaked: null,
    stageCount: 26,
    jobKinds: ['CHARACTER_MASTER_BUILD', 'CHARACTER_SOURCE_MATERIALIZE', 'CHARACTER_BUILD'],
  };
}

export function readCharacterWorkerPin(repoRoot = process.cwd()): CharacterWorkerPin {
  const candidates = [
    path.join(repoRoot, CHARACTER_WORKER_PIN_PATH),
    path.resolve(__dirname, '../../../../', CHARACTER_WORKER_PIN_PATH),
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as CharacterWorkerPin;
      if (parsed.schema === 'TIVVLEJOY_GOAT_CHARACTER_WORKER_IMAGE_PIN_V1') return parsed;
    } catch {
      /* try next */
    }
  }
  return emptyCharacterWorkerPin();
}
