/**
 * Explicit worker exit classifications for the Runpod GPU worker.
 *
 * Every abnormal termination is mapped to ONE of these stable classifications
 * so a paid-pod failure is always diagnosable from the persisted status /
 * process exit code alone (RunPod surfaces the container exit code even when no
 * in-container logs were captured). A COMPLETE is NEVER emitted on any of these
 * paths — they all fail closed.
 */

const EXIT_CLASS = Object.freeze({
  OK: 'OK',
  IMAGE_BOOT_FAILURE: 'IMAGE_BOOT_FAILURE',
  ENV_CONFIGURATION_FAILURE: 'ENV_CONFIGURATION_FAILURE',
  R2_INITIALIZATION_FAILURE: 'R2_INITIALIZATION_FAILURE',
  MANIFEST_FAILURE: 'MANIFEST_FAILURE',
  ASSET_FAILURE: 'ASSET_FAILURE',
  BLENDER_BINARY_FAILURE: 'BLENDER_BINARY_FAILURE',
  BLENDER_INITIALIZATION_FAILURE: 'BLENDER_INITIALIZATION_FAILURE',
  EEVEE_CONTEXT_FAILURE: 'EEVEE_CONTEXT_FAILURE',
  FFMPEG_FAILURE: 'FFMPEG_FAILURE',
  UPLOAD_FAILURE: 'UPLOAD_FAILURE',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN_FATAL: 'UNKNOWN_FATAL',
});

/**
 * Stable numeric exit codes per classification. Distinct codes make the failure
 * class recoverable purely from RunPod's reported container exit status.
 */
const EXIT_CODE = Object.freeze({
  OK: 0,
  UNKNOWN_FATAL: 1,
  IMAGE_BOOT_FAILURE: 10,
  ENV_CONFIGURATION_FAILURE: 11,
  R2_INITIALIZATION_FAILURE: 12,
  MANIFEST_FAILURE: 13,
  ASSET_FAILURE: 14,
  BLENDER_BINARY_FAILURE: 15,
  BLENDER_INITIALIZATION_FAILURE: 16,
  EEVEE_CONTEXT_FAILURE: 17,
  FFMPEG_FAILURE: 18,
  UPLOAD_FAILURE: 19,
  TIMEOUT: 20,
});

/**
 * Map an internal error `code` (as thrown by render-core / single-shot / r2)
 * onto a stable EXIT_CLASS. Anything unrecognised is UNKNOWN_FATAL.
 */
function classifyCode(code) {
  switch (code) {
    case 'NO_JOB_ID':
    case 'R2_CONFIG_INCOMPLETE':
      return EXIT_CLASS.ENV_CONFIGURATION_FAILURE;
    case 'R2_INIT_FAILED':
    case 'R2_CONNECT_FAILED':
      return EXIT_CLASS.R2_INITIALIZATION_FAILURE;
    case 'MANIFEST_MISSING':
    case 'MANIFEST_INVALID':
    case 'JOB_ID_MISMATCH':
      return EXIT_CLASS.MANIFEST_FAILURE;
    case 'ASSET_MISSING_OR_HASH_MISMATCH':
    case 'ASSET_HASH_MISMATCH':
    case 'ASSET_URI_UNSUPPORTED':
      return EXIT_CLASS.ASSET_FAILURE;
    case 'BLENDER_NOT_FOUND':
      return EXIT_CLASS.BLENDER_BINARY_FAILURE;
    case 'BLENDER_FAILED':
    case 'NO_FRAMES':
    case 'FRAME_COUNT_MISMATCH':
    case 'EMPTY_FRAME':
    case 'BLENDER_PREFLIGHT_FAILED':
      return EXIT_CLASS.BLENDER_INITIALIZATION_FAILURE;
    case 'EEVEE_CONTEXT_FAILED':
    case 'GL_CONTEXT_FAILED':
    case 'EGL_INIT_FAILED':
      return EXIT_CLASS.EEVEE_CONTEXT_FAILURE;
    case 'FFMPEG_FAILED':
    case 'OUTPUT_INVALID':
    case 'OUTPUT_RESOLUTION_MISMATCH':
      return EXIT_CLASS.FFMPEG_FAILURE;
    case 'R2_UPLOAD_FAILED':
    case 'R2_METADATA_UPLOAD_FAILED':
    case 'R2_READBACK_FAILED':
    case 'R2_READBACK_HASH_MISMATCH':
      return EXIT_CLASS.UPLOAD_FAILURE;
    case 'TIMEOUT':
    case 'STARTUP_TIMEOUT':
    case 'RUNTIME_TIMEOUT':
    case 'R2_TIMEOUT':
    case 'NETWORK_TIMEOUT':
      return EXIT_CLASS.TIMEOUT;
    default:
      return EXIT_CLASS.UNKNOWN_FATAL;
  }
}

/** Numeric process exit code for a classification (defaults to UNKNOWN_FATAL=1). */
function exitCodeFor(classification) {
  return EXIT_CODE[classification] ?? EXIT_CODE.UNKNOWN_FATAL;
}

module.exports = { EXIT_CLASS, EXIT_CODE, classifyCode, exitCodeFor };
