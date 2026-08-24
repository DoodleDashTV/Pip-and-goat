/**
 * Authoritative character-worker image pin. The org segment coincidentally
 * equals GHCR_USER / R2_BUCKET, so the secret scanner may flag the line.
 */
export const CHARACTER_WORKER_IMAGE =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:1e29b0bac9a1af63137ca1c12d60c1819267d9990c029b1cc6867bc0639fe5f9'; // pragma: allowlist secret
export const CHARACTER_WORKER_IMAGE_DIGEST = 'sha256:1e29b0bac9a1af63137ca1c12d60c1819267d9990c029b1cc6867bc0639fe5f9';
export const CHARACTER_WORKER_IMAGE_SOURCE_COMMIT = '08d6fa5e664fcfb620ad219bf0b3271ebc3bbcd4';
