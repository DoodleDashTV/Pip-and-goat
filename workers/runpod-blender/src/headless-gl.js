/**
 * Headless GL/EGL configuration for Blender 4.2 EEVEE in a cloud container with
 * NO display server.
 *
 * Blender 4.2 EEVEE-Next requires a working GL/EGL context even in
 * `--background`. In a headless container this must be created off-screen:
 *   - GPU present  -> NVIDIA EGL via libglvnd
 *                     (__EGL_VENDOR_LIBRARY_DIRS + __GLX_VENDOR_LIBRARY_NAME=nvidia,
 *                      EGL_PLATFORM=device/surfaceless)
 *   - No GPU       -> Mesa software rasteriser
 *                     (LIBGL_ALWAYS_SOFTWARE=1, GALLIUM_DRIVER=llvmpipe,
 *                      EGL_PLATFORM=surfaceless)
 *
 * The selected configuration is explicit and recorded — the worker never
 * silently switches GL backends without logging it.
 */
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { buildRenderSubprocessEnvironment } = require('./child-env');

function nvidiaGpuPresent(sourceEnv = process.env) {
  try {
    const env = buildRenderSubprocessEnvironment({ PATH: sourceEnv.PATH || process.env.PATH, ...sourceEnv });
    const res = spawnSync('nvidia-smi', ['-L'], { encoding: 'utf8', timeout: 15_000, env });
    return res.status === 0 && /GPU\s+\d+/.test(res.stdout || '');
  } catch {
    return false;
  }
}

function firstExistingDir(candidates) {
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Resolve the headless GL/EGL environment overlay for the current host.
 *
 * @param {object} [opts]
 * @param {Record<string,string|undefined>} [opts.env] base env (defaults to process.env)
 * @param {boolean} [opts.forceSoftware] force the software rasteriser path
 * @param {() => boolean} [opts.detectGpu] injectable GPU detector (tests)
 * @returns {{ mode: 'NVIDIA_EGL'|'SOFTWARE_LLVMPIPE', overlay: Record<string,string>,
 *            gpuPresent: boolean, eglVendorDir: string|null, reason: string }}
 */
function resolveHeadlessGlConfig(opts = {}) {
  const env = opts.env || process.env;
  const detectGpu = opts.detectGpu || nvidiaGpuPresent;
  const gpuPresent = opts.forceSoftware ? false : detectGpu(env);

  if (gpuPresent) {
    const eglVendorDir = firstExistingDir([
      '/usr/share/glvnd/egl_vendor.d',
      '/usr/local/share/glvnd/egl_vendor.d',
    ]);
    const overlay = {
      __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
      __NV_PRIME_RENDER_OFFLOAD: '1',
      // surfaceless is the most portable off-screen EGL platform inside a
      // container; device is used when EGL_EXT_platform_device is available.
      EGL_PLATFORM: env.EGL_PLATFORM || 'surfaceless',
    };
    if (eglVendorDir) overlay.__EGL_VENDOR_LIBRARY_DIRS = eglVendorDir;
    return {
      mode: 'NVIDIA_EGL',
      overlay,
      gpuPresent: true,
      eglVendorDir,
      reason: 'NVIDIA GPU detected — using NVIDIA EGL (libglvnd) for headless EEVEE.',
    };
  }

  return {
    mode: 'SOFTWARE_LLVMPIPE',
    overlay: {
      LIBGL_ALWAYS_SOFTWARE: '1',
      GALLIUM_DRIVER: 'llvmpipe',
      EGL_PLATFORM: 'surfaceless',
      // Mesa software GL context creation without a display.
      MESA_GL_VERSION_OVERRIDE: env.MESA_GL_VERSION_OVERRIDE || '4.5',
    },
    gpuPresent: false,
    eglVendorDir: null,
    reason: opts.forceSoftware
      ? 'Software GL forced (diagnostic / CPU fallback).'
      : 'No NVIDIA GPU detected — using Mesa llvmpipe software rasteriser (diagnostic fallback).',
  };
}

/**
 * Apply the headless GL overlay onto a base env object, WITHOUT clobbering any
 * value the operator has already set explicitly. Returns the merged env.
 */
function applyHeadlessGlEnv(baseEnv, config) {
  const merged = { ...baseEnv };
  for (const [k, v] of Object.entries(config.overlay)) {
    if (merged[k] === undefined || merged[k] === '') merged[k] = v;
  }
  return merged;
}

module.exports = { resolveHeadlessGlConfig, applyHeadlessGlEnv, nvidiaGpuPresent };
