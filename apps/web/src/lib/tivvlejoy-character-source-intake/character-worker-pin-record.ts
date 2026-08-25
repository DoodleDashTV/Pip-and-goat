import { readFileSync } from 'node:fs';
import path from 'node:path';

export const CHARACTER_WORKER_PIN_PATH = 'config/cloud/character-worker-image.json' as const;
export const CHARACTER_WORKER_PIN_TS_PATH = 'config/cloud/character-worker-image.pin.ts' as const;

export const FORBIDDEN_STALE_WORKER_DIGESTS = [
  'sha256:8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830',
  'sha256:b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed',
] as const;

export const SUPERSEDED_UNWIRED_GOAT_DOWNLOAD_DIGEST =
  'sha256:1e29b0bac9a1af63137ca1c12d60c1819267d9990c029b1cc6867bc0639fe5f9' as const;

export const SUPERSEDED_V3_NO_DURABLE_OUTPUT_DIGEST =
  'sha256:59867e8569fdbd08929112939468fe540a22c5a572bd182bfd1d5d3bc455fbdd' as const;

export const SUPERSEDED_V4_MISSING_ASSET_PROVENANCE_DIGEST =
  'sha256:582384a9963015525f93ecc28a15ee7546a9c6378a5672db728a7ee1cd9e00e3' as const;

export const SUPERSEDED_V5_PYTHON_RUNTIME_DIGEST =
  'sha256:0fb854aa5298b25a8308d56f120b703f9406f7b14d4dc04f9574d0caf157f7b0' as const;

export const REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS = [
  ...FORBIDDEN_STALE_WORKER_DIGESTS,
  'sha256:f732091b0fc1035aff09ed5897672eec786b1d618b2c2ac07d5ad4d217c0008e',
  SUPERSEDED_UNWIRED_GOAT_DOWNLOAD_DIGEST,
  SUPERSEDED_V3_NO_DURABLE_OUTPUT_DIGEST,
  SUPERSEDED_V4_MISSING_ASSET_PROVENANCE_DIGEST,
  SUPERSEDED_V5_PYTHON_RUNTIME_DIGEST,
] as const;

export const REQUIRED_LIVE_CAPABILITY_SCHEMA = 'TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V2' as const;
export const REJECTED_LIVE_CAPABILITY_SCHEMA = 'TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V1' as const;

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

function candidateFiles(relativePath: string, repoRoot: string): string[] {
  return [
    path.join(repoRoot, relativePath),
    path.resolve(repoRoot, '..', '..', relativePath),
    path.resolve(__dirname, '../../../../../', relativePath),
    path.resolve(__dirname, '../../../../', relativePath),
  ];
}

function readPinnedCharacterWorkerRef(repoRoot: string): string | null {
  for (const file of candidateFiles(CHARACTER_WORKER_PIN_TS_PATH, repoRoot)) {
    try {
      const text = readFileSync(file, 'utf8');
      const match = text.match(/ghcr\.io\/[A-Za-z0-9._-]+\/ddp-runpod-blender@sha256:[0-9a-f]{64}/);
      if (match) return match[0];
    } catch {
      /* try next */
    }
  }
  return null;
}

export function readCharacterWorkerPin(repoRoot = process.cwd()): CharacterWorkerPin {
  for (const file of candidateFiles(CHARACTER_WORKER_PIN_PATH, repoRoot)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as CharacterWorkerPin;
      if (parsed.schema !== 'TIVVLEJOY_GOAT_CHARACTER_WORKER_IMAGE_PIN_V1') continue;
      const resolvedRef = readPinnedCharacterWorkerRef(repoRoot);
      if (resolvedRef) return { ...parsed, ref: resolvedRef };
      return parsed;
    } catch {
      /* try next */
    }
  }
  return emptyCharacterWorkerPin();
}
