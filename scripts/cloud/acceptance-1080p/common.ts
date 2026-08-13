/**
 * Shared helpers for the FINAL_1080P (1080x1920) single-pod acceptance render.
 *
 * NON-BILLABLE by itself. Pod creation lives only in launch.ts and stays gated
 * behind ALLOW_PAID_GPU_LAUNCH (set in-process for exactly one launch).
 * Never prints secret values.
 */
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  createObjectStorageFromConfig,
  resolveObjectStorageConfig,
  type ObjectStorage,
} from '@doodle-dash/shared';
import {
  characterAssetKey,
  environmentAssetKey,
  propAssetKey,
  contentAddressedVersionId,
  renderFinalKey,
} from '../../../packages/production/src/cloud/r2-layout';

export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const LIB = path.join(REPO_ROOT, 'production-library');
export const STATE_DIR = path.join(REPO_ROOT, 'artifacts/acceptance-1080p');
export const STATE_FILE = path.join(STATE_DIR, 'run-state.json');

/**
 * The digest-pinned hardened worker image. This is a PUBLIC, non-secret ghcr.io
 * reference (anonymous pull verified). Its org segment coincidentally equals the
 * R2 bucket name, so the secret scanner may flag the line.
 *
 * WORKER_IMAGE_SOURCE_COMMIT / WORKER_IMAGE_RENDER_CODE_SHA256 are the build
 * provenance the image is stamped with. Preflight reads the same values back
 * from the registry and refuses a paid launch on any disagreement, because the
 * Blender scene-assembly code is baked into the image: a pullable but stale
 * image once rendered pre-repair 8-light lighting while every other gate passed.
 * All of these constants must be re-pinned together whenever the image is
 * rebuilt.
 *
 * Rebuilt and published at 324ce5c with early R2 boot diagnostics.
 * Anonymous registry read confirms the labels below; preflight refuses any
 * disagreement. Rebuild with `scripts/cloud/build-worker-image.sh` and re-pin
 * all four constants together if the baked render code moves again.
 */
export const WORKER_IMAGE =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:32a0e34fde92c90acb3a6b7d6e880216ef162483cd4f6ada8a538b106a388adb'; // pragma: allowlist secret
export const WORKER_IMAGE_SOURCE_COMMIT = '324ce5ceaa798ee62d3450e95a64084d0d867912';
export const WORKER_IMAGE_RENDER_CODE_SHA256 =
  'cbd8061f83492bc967994b22dcfb21bbd6b52e341ddf9b60fa956d5738806a29';

/**
 * Fingerprint of the approved `.blend` assets this checkout would render, from
 * `computeRenderAssetFingerprint`. Unlike the render code it is not baked into
 * the image (the worker downloads assets from R2 and checks each against the
 * manifest), so it is pinned here: editing a character or prop then has to be
 * re-pinned deliberately rather than silently uploaded under a fresh key.
 */
export const WORKER_IMAGE_RENDER_ASSET_SHA256 =
  '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7';

/**
 * The image the cloud re-acceptance render actually ran, kept for the provenance
 * record. Superseded: its baked render code is c4afa39c…, this checkout is
 * elsewhere, and the two must agree before a paid launch.
 */
export const PREVIOUS_WORKER_IMAGE =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:e80cf523b7cb6d6c3a7c8dedda22e90ca0b8664f65be4c55eb82323083b31c27'; // pragma: allowlist secret
export const PREVIOUS_WORKER_IMAGE_SOURCE_COMMIT = 'bb5270372ad558e71673fe789260a12fb51a9c6d';
export const PREVIOUS_WORKER_IMAGE_RENDER_CODE_SHA256 =
  'c4afa39c8c06b32df7352ff0c02675b64ba6da13a0067215182cb07551ca4c91';

export const HARD_CAP_USD = 0.25;

// Representative FINAL_1080P shot: "Meadow Map Mystery" — Pip + Goat examining
// the adventure map in the sunny meadow, real rig actions + camera push-in.
export const EPISODE_ID = 'meadow-map-mystery';
export const RESOLUTION = '1080x1920';
export const FPS = 30;
export const FRAME_START = 1;
export const FRAME_END = 90; // 90 frames @30fps = 3.0s (within 90-150 window, cheapest)
export const FINAL_SAMPLES = 24; // FINAL_1080P (production, not draft)
export const BLENDER_VERSION = '4.2.3';

export type FoundingAsset = {
  role: 'meadow' | 'map' | 'pip' | 'goat';
  kind: 'blend';
  logicalId: string;
  localPath: string;
  filename: string;
};

/** The four founding production-library assets (approved; never regenerated). */
export const FOUNDING_ASSETS: FoundingAsset[] = [
  {
    role: 'meadow',
    kind: 'blend',
    logicalId: 'env_meadow_v1',
    filename: 'meadow_production.blend',
    localPath: path.join(LIB, 'environments/meadow_production.blend'),
  },
  {
    role: 'map',
    kind: 'blend',
    logicalId: 'prop_map_001',
    filename: 'adventure_map.blend',
    localPath: path.join(LIB, 'props/adventure_map.blend'),
  },
  {
    role: 'pip',
    kind: 'blend',
    logicalId: 'char_pip_v1',
    filename: 'pip_production.blend',
    localPath: path.join(LIB, 'characters/pip_production.blend'),
  },
  {
    role: 'goat',
    kind: 'blend',
    logicalId: 'char_goat_v1',
    filename: 'goat_production.blend',
    localPath: path.join(LIB, 'characters/goat_production.blend'),
  },
];

export function sha256File(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/** Compute the durable, content-addressed R2 key for a founding asset. */
export function r2KeyFor(asset: FoundingAsset, sha256: string): string {
  const version = contentAddressedVersionId(sha256, asset.logicalId);
  if (asset.role === 'pip') return characterAssetKey('pip', version, asset.filename);
  if (asset.role === 'goat') return characterAssetKey('goat', version, asset.filename);
  if (asset.role === 'meadow') return environmentAssetKey(asset.logicalId, version, asset.filename);
  return propAssetKey(asset.logicalId, version, asset.filename);
}

export type ResolvedAsset = {
  role: string;
  kind: string;
  r2Key: string;
  sha256: string;
  localPath: string;
  bytes: number;
};

export function resolveAssets(): ResolvedAsset[] {
  return FOUNDING_ASSETS.map((a) => {
    if (!existsSync(a.localPath)) {
      throw new Error(`Founding asset missing on disk: ${a.localPath}`);
    }
    const sha256 = sha256File(a.localPath);
    return {
      role: a.role,
      kind: a.kind,
      r2Key: r2KeyFor(a, sha256),
      sha256,
      localPath: a.localPath,
      bytes: readFileSync(a.localPath).length,
    };
  });
}

/** The immutable single-shot worker manifest (worker schema ddp-cloud-job-manifest-v1). */
export function buildAcceptanceManifest(jobId: string, assets: ResolvedAsset[]) {
  const outputKey = renderFinalKey(EPISODE_ID, jobId, 'final_1080p.mp4');
  const shotMeta = {
    title: 'Meadow Map Mystery — FINAL_1080P acceptance',
    cameraPreset: 'PUSH_IN',
    // assemble_scene.py reads the state name from here and falls back to
    // DAY_SOFT when it is absent. Every local measurement this acceptance is
    // judged against — the scene gates and the local CPU acceptance render —
    // was taken on DAY_KEY, so name it explicitly rather than letting the cloud
    // render a state no local evidence covers.
    lightingState: 'DAY_KEY',
    // assemble_scene.py applies a placement to the role's armature, or failing that
    // to the FIRST mesh it imported. The map blend is a multi-object set
    // (AdventureMap + MapMark) with no armature, so placing it moves only one piece
    // and detaches the marker from the paper: leave it at its authored transform.
    placements: {
      pip: { location: [-0.72, -1.5, 0.0], rotation: [0.0, 0.0, 0.34], action: 'PIP_POINT' },
      goat: { location: [0.72, -1.2, 0.0], rotation: [0.0, 0.0, -0.42], action: 'GOAT_HEAD_NOD' },
    },
  };
  const manifest = {
    schemaVersion: 'ddp-cloud-job-manifest-v1',
    jobId,
    episodeId: EPISODE_ID,
    sceneId: 'meadow_map_mystery',
    renderMode: 'FINAL_1080P',
    resolution: RESOLUTION,
    fps: FPS,
    frameRange: { start: FRAME_START, end: FRAME_END },
    blenderVersion: BLENDER_VERSION,
    eevee: { engine: 'EEVEE', samples: FINAL_SAMPLES },
    cameraState: { preset: 'PUSH_IN' },
    lightingState: {},
    vfxState: {},
    shotMeta,
    expectedAssets: assets.map((a) => ({
      role: a.role,
      kind: a.kind,
      r2Key: a.r2Key,
      sha256: a.sha256,
    })),
    outputKey,
    limits: {
      maxRuntimeMinutes: 15,
      maxCostUsd: HARD_CAP_USD,
      maxFrames: 300,
    },
    createdAt: new Date().toISOString(),
    credentialsPolicy: {
      secretsInManifest: false,
      r2Scoped: true,
      runpodServerSideOnly: true,
    },
  };
  return manifest;
}

export function manifestKeyFor(jobId: string): string {
  return `jobs/${jobId}/manifest.json`;
}
export function statusKeyFor(jobId: string): string {
  return `jobs/${jobId}/status.json`;
}
export function startupStatusKeyFor(jobId: string): string {
  return `jobs/${jobId}/startup-status.json`;
}
export function metadataKeyFor(jobId: string): string {
  return `jobs/${jobId}/metadata.json`;
}

export function makeStorage(): ObjectStorage {
  const env = { ...process.env } as Record<string, string | undefined>;
  if (!env.OBJECT_STORAGE_PROVIDER && env.R2_BUCKET) env.OBJECT_STORAGE_PROVIDER = 'r2';
  const cfg = resolveObjectStorageConfig(env);
  if (cfg.provider !== 's3') throw new Error('R2/S3 provider not configured');
  return createObjectStorageFromConfig(cfg);
}

export function ensureStateDir() {
  mkdirSync(STATE_DIR, { recursive: true });
}

export function redact(text: string): string {
  let out = String(text ?? '');
  for (const k of [
    'RUNPOD_API_KEY',
    'R2_SECRET_ACCESS_KEY',
    'R2_ACCESS_KEY_ID',
    'GHCR_TOKEN',
  ]) {
    const v = process.env[k];
    if (v && v.length > 3) out = out.split(v).join(`[REDACTED_${k}]`);
  }
  return out.replace(/\brpa_[A-Za-z0-9]+/g, 'rpa_[REDACTED]');
}
