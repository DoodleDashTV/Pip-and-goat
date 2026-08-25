/**
 * Authoritative character-worker image pin. The org segment coincidentally
 * equals GHCR_USER / R2_BUCKET, so the secret scanner may flag the line.
 */
export const CHARACTER_WORKER_IMAGE =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:78f1b16286b0ffc331a787d74297593fa98c455fb24fcecf48d5be5bdeec48b6'; // pragma: allowlist secret
export const CHARACTER_WORKER_IMAGE_DIGEST = 'sha256:78f1b16286b0ffc331a787d74297593fa98c455fb24fcecf48d5be5bdeec48b6';
export const CHARACTER_WORKER_IMAGE_SOURCE_COMMIT = 'db8658c835ccb0e5a3adc3201d7ba90e9aaeaa46';
