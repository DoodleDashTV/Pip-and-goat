/**
 * Authoritative character-worker image pin. The org segment coincidentally
 * equals GHCR_USER / R2_BUCKET, so the secret scanner may flag the line.
 */
export const CHARACTER_WORKER_IMAGE =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:59867e8569fdbd08929112939468fe540a22c5a572bd182bfd1d5d3bc455fbdd'; // pragma: allowlist secret
export const CHARACTER_WORKER_IMAGE_DIGEST = 'sha256:59867e8569fdbd08929112939468fe540a22c5a572bd182bfd1d5d3bc455fbdd';
export const CHARACTER_WORKER_IMAGE_SOURCE_COMMIT = '4b57856d69b8e5d698e58dcca136ffa86872bc0b';
