/**
 * Authoritative character-worker image pin. The org segment coincidentally
 * equals GHCR_USER / R2_BUCKET, so the secret scanner may flag the line.
 */
export const CHARACTER_WORKER_IMAGE =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:0fb854aa5298b25a8308d56f120b703f9406f7b14d4dc04f9574d0caf157f7b0'; // pragma: allowlist secret
export const CHARACTER_WORKER_IMAGE_DIGEST = 'sha256:0fb854aa5298b25a8308d56f120b703f9406f7b14d4dc04f9574d0caf157f7b0';
export const CHARACTER_WORKER_IMAGE_SOURCE_COMMIT = 'ec84229db8e4c14ecfcb9e3660f49830547cc833';
