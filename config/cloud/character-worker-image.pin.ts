/**
 * Authoritative character-worker image pin. The org segment coincidentally
 * equals GHCR_USER / R2_BUCKET, so the secret scanner may flag the line.
 */
export const CHARACTER_WORKER_IMAGE =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:582384a9963015525f93ecc28a15ee7546a9c6378a5672db728a7ee1cd9e00e3'; // pragma: allowlist secret
export const CHARACTER_WORKER_IMAGE_DIGEST = 'sha256:582384a9963015525f93ecc28a15ee7546a9c6378a5672db728a7ee1cd9e00e3';
export const CHARACTER_WORKER_IMAGE_SOURCE_COMMIT = 'c8168362d3e2034739efea30161f3ae45d23f986';
