/**
 * Least-privilege environment for render subprocesses (Blender, FFmpeg, ffprobe).
 *
 * TivvleJoy never injects the launcher/account RUNPOD_API_KEY. RunPod may still
 * inject a Pod-scoped RUNPOD_API_KEY at runtime. That platform key — and every
 * other credential — must stay in the Node worker process. It must never be
 * forwarded into Blender, FFmpeg, ffprobe, or helper subprocesses.
 *
 * This module always returns a COPY. It never mutates the caller object.
 */
const CHILD_ENV_DENY = Object.freeze([
  'RUNPOD_API_KEY',
  'RUNPOD_API_ENDPOINT',
  'RUNPOD_RENDER_TEMPLATE_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_PAT',
  'VERCEL_TOKEN',
  'VERCEL_OIDC_TOKEN',
  'LAUNCH_TIVVLEJOY_GPU',
  'PAID_APPROVAL_PHRASE',
  'confirm_paid_gpu',
  'Authorization',
  'AUTHORIZATION',
]);

const CHILD_ENV_ALLOWLIST = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_NUMERIC',
  'TZ',
  'PWD',
  'HOSTNAME',
  'TERM',
  'SHELL',
  'LD_LIBRARY_PATH',
  'BLENDER_USER_RESOURCES',
  'BLENDER_SYSTEM_SCRIPTS',
  'BLENDER_SYSTEM_DATAFILES',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_RUNTIME_DIR',
  'EGL_PLATFORM',
  'MESA_GL_VERSION_OVERRIDE',
  'LIBGL_ALWAYS_SOFTWARE',
  'GALLIUM_DRIVER',
  '__GLX_VENDOR_LIBRARY_NAME',
  '__NV_PRIME_RENDER_OFFLOAD',
  '__EGL_VENDOR_LIBRARY_DIRS',
  'NVIDIA_VISIBLE_DEVICES',
  'NVIDIA_DRIVER_CAPABILITIES',
  'DDP_PREFLIGHT_OUT',
  'DDP_PREFLIGHT_ENGINE',
  'DDP_SOURCE_COMMIT',
  'DDP_WORKER_BUILD_TIME',
  'DDP_RENDER_CODE_SHA256',
  'DDP_IMAGE_DIGEST',
  'DDP_PROVENANCE_FILE',
  'RUNPOD_WORKER_IMAGE',
  'RENDER_WORKSPACE_DIR',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'CURL_CA_BUNDLE',
]);

const CHILD_ENV_DENY_SET = new Set(CHILD_ENV_DENY);
const CHILD_ENV_ALLOW_SET = new Set(CHILD_ENV_ALLOWLIST);

function tagged(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function assertSafeChildEnvKey(key) {
  if (CHILD_ENV_DENY_SET.has(key) || !CHILD_ENV_ALLOW_SET.has(key)) {
    throw tagged(`Render subprocess env key is not safely classified: ${key}`, 'CHILD_ENV_UNSAFE');
  }
}

/**
 * Build a copy of env containing only what Blender / FFmpeg / ffprobe need.
 * Fail closed if PATH cannot be classified or an extra key is unsafe.
 *
 * INPUT / launch-payload RUNPOD_API_KEY is refused by buildWorkerEnvironment().
 * A platform-injected Pod-scoped RUNPOD_API_KEY may exist on process.env at
 * runtime; this helper still strips it so render children never see it.
 */
function buildRenderSubprocessEnvironment(sourceEnv, extras = {}) {
  if (!sourceEnv || typeof sourceEnv !== 'object') {
    throw tagged('Child environment source is required.', 'CHILD_ENV_UNSAFE');
  }
  const out = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = sourceEnv[key];
    if (value !== undefined && value !== null && String(value) !== '') {
      out[key] = String(value);
    }
  }
  for (const [key, value] of Object.entries(extras || {})) {
    assertSafeChildEnvKey(key);
    if (value !== undefined && value !== null) out[key] = String(value);
  }
  for (const key of CHILD_ENV_DENY) delete out[key];
  if (!out.PATH) {
    throw tagged('PATH cannot be safely classified for render subprocesses.', 'CHILD_ENV_UNSAFE');
  }
  return out;
}

function childEnvContainsDeniedSecret(env) {
  if (!env || typeof env !== 'object') return false;
  return CHILD_ENV_DENY.some((key) => Object.prototype.hasOwnProperty.call(env, key));
}

function assertChildEnvIsolated(env) {
  if (childEnvContainsDeniedSecret(env)) {
    throw tagged('Render subprocess env contains a denied credential.', 'CHILD_ENV_UNSAFE');
  }
  return env;
}

module.exports = {
  CHILD_ENV_ALLOWLIST,
  CHILD_ENV_DENY,
  buildRenderSubprocessEnvironment,
  sanitizeWorkerChildEnvironment: buildRenderSubprocessEnvironment,
  childEnvContainsDeniedSecret,
  assertChildEnvIsolated,
};
