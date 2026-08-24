/**
 * Authoritative character-worker image pin. The org segment coincidentally
 * equals GHCR_USER / R2_BUCKET, so the secret scanner may flag the line.
 */
export const CHARACTER_WORKER_IMAGE =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:f732091b0fc1035aff09ed5897672eec786b1d618b2c2ac07d5ad4d217c0008e'; // pragma: allowlist secret
export const CHARACTER_WORKER_IMAGE_DIGEST = 'sha256:f732091b0fc1035aff09ed5897672eec786b1d618b2c2ac07d5ad4d217c0008e';
export const CHARACTER_WORKER_IMAGE_SOURCE_COMMIT = 'fdf0b28c2d656a06f7ca4a38880ab3b56cd25cd3';
