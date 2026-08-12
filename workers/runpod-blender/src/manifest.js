/**
 * Single-shot cloud job manifest helpers for the Runpod worker.
 * The manifest is the immutable contract written to R2 by the DDP control
 * plane and consumed by the GPU worker. It never contains secrets.
 */
const { MANIFEST_SCHEMA, validateManifest } = require('./render-core');

/**
 * Build a production-grade single-shot manifest for a benchmark/render job.
 * `expectedAssets` entries are { role, kind, r2Key, sha256 }.
 */
function buildManifest(input) {
  const now = new Date().toISOString();
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA,
    jobId: input.jobId,
    episodeId: input.episodeId,
    sceneId: input.sceneId || input.episodeId,
    renderMode: input.renderMode, // output target, e.g. DRAFT_HD | FINAL_1080P
    resolution: input.resolution, // "WxH"
    fps: input.fps,
    frameRange: { start: input.frameStart, end: input.frameEnd },
    blenderVersion: input.blenderVersion || '4.2.3',
    eevee: {
      engine: input.engine || 'EEVEE',
      samples: input.samples,
    },
    cameraState: input.cameraState || {},
    lightingState: input.lightingState || {},
    vfxState: input.vfxState || {},
    shotMeta: input.shotMeta || {},
    expectedAssets: (input.expectedAssets || []).map((a) => ({
      role: a.role,
      kind: a.kind || 'blend',
      r2Key: a.r2Key,
      sha256: a.sha256,
    })),
    outputKey: input.outputKey, // output R2 destination
    limits: {
      maxRuntimeMinutes: input.maxRuntimeMinutes,
      maxCostUsd: input.maxCostUsd,
      maxFrames: input.maxFrames,
    },
    createdAt: now,
    credentialsPolicy: {
      secretsInManifest: false,
      r2Scoped: true,
      runpodServerSideOnly: true,
    },
  };
  return validateManifest(manifest);
}

module.exports = { buildManifest, validateManifest, MANIFEST_SCHEMA };
