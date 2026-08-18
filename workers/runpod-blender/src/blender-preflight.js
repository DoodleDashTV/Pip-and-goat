/**
 * Lightweight headless Blender preflight for the Runpod GPU worker.
 *
 * Before committing a paid pod to a real render, verify — in a few seconds —
 * that Blender actually launches, that the `bpy` API imports, that the EEVEE
 * engine is available, that a minimal scene (camera + light + mesh) initialises,
 * and that a tiny frame renders and is written. This is the check the OLD image
 * lacked: its health benchmark rendered a scene with NO CAMERA, so it ALWAYS
 * threw "Cannot render, no camera" and crash-looped the pod.
 *
 * GL/EGL/context failures are detected explicitly and surfaced as
 * EEVEE_CONTEXT_FAILED so the caller can classify EEVEE_CONTEXT_FAILURE rather
 * than a generic render error. Never silently changes the engine.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runInstrumented } = require('./child-proc');
const { resolveHeadlessGlConfig, applyHeadlessGlEnv } = require('./headless-gl');
const { buildRenderSubprocessEnvironment } = require('./child-env');

const PREFLIGHT_SENTINEL = 'DDP_PREFLIGHT_OK';

// Minimal, engine-honest preflight scene. Adds a camera + sun so the render is
// actually possible, prefers EEVEE-Next (Blender 4.2) and falls back to classic
// EEVEE, and prints the engine it used so an engine switch is never silent.
const PREFLIGHT_PY = `
import bpy, sys, os
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
requested = os.environ.get('DDP_PREFLIGHT_ENGINE', 'BLENDER_EEVEE_NEXT')
engine = requested
try:
    scene.render.engine = requested
except Exception:
    engine = 'BLENDER_EEVEE'
    scene.render.engine = 'BLENDER_EEVEE'
print('DDP_PREFLIGHT_ENGINE_USED=' + scene.render.engine)
scene.render.resolution_x = 32
scene.render.resolution_y = 32
scene.eevee.taa_render_samples = 1 if hasattr(scene, 'eevee') else 1
out = os.environ['DDP_PREFLIGHT_OUT']
scene.render.filepath = out
bpy.ops.mesh.primitive_cube_add()
cam_data = bpy.data.cameras.new('ddp_preflight_cam')
cam_obj = bpy.data.objects.new('ddp_preflight_cam', cam_data)
scene.collection.objects.link(cam_obj)
cam_obj.location = (5.0, -5.0, 4.0)
scene.camera = cam_obj
bpy.ops.object.light_add(type='SUN')
bpy.ops.render.render(write_still=True)
if not os.path.exists(out) or os.path.getsize(out) <= 0:
    print('DDP_PREFLIGHT_NO_OUTPUT')
    sys.exit(3)
print('${PREFLIGHT_SENTINEL} bytes=' + str(os.path.getsize(out)))
`;

function looksLikeGlContextFailure(text) {
  const t = String(text || '');
  return (
    /EGL_BAD|eglInitialize|EGL Error|Cannot find a suitable EGL|failed to create.*context/i.test(t) ||
    /GPUShader|GL_INVALID|Unable to open a display|glXCreate|Failed to initialize Glew/i.test(t) ||
    /No supported (GPU|GL) backend/i.test(t)
  );
}

/**
 * Run the Blender preflight.
 *
 * @param {object} [opts]
 * @param {string} [opts.blenderBin]
 * @param {Record<string,string|undefined>} [opts.env]
 * @param {number} [opts.timeoutMs]
 * @param {boolean} [opts.forceSoftware]
 * @param {(bin:string,args:string[],o?:object)=>any} [opts.runCommand] injectable (tests)
 * @returns {{ ok:boolean, code:string|null, glMode:string, engineUsed:string|null,
 *            durationMs:number, diagnostic:object, reason:string }}
 */
function runBlenderPreflight(opts = {}) {
  const blenderBin = opts.blenderBin || (opts.env && opts.env.BLENDER_BIN) || 'blender';
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const source = opts.env || {};
  const sanitizedBase = buildRenderSubprocessEnvironment({
    PATH: source.PATH || process.env.PATH || '/usr/bin',
    ...source,
  });
  const glConfig = resolveHeadlessGlConfig({ env: sanitizedBase, forceSoftware: opts.forceSoftware });

  // Injectable path for unit tests (no real Blender).
  if (opts.runCommand) {
    const injectedEnv = applyHeadlessGlEnv(sanitizedBase, glConfig);
    const res = opts.runCommand(blenderBin, ['--version'], { env: injectedEnv });
    if (!res || res.status !== 0) {
      return { ok: false, code: 'BLENDER_NOT_FOUND', glMode: glConfig.mode, engineUsed: null, durationMs: 0, diagnostic: {}, reason: 'Blender binary not runnable.' };
    }
    const run = opts.runCommand(blenderBin, ['--background', '--factory-startup', '--python', '<preflight>'], { env: injectedEnv });
    const combined = `${(run && run.stdout) || ''}\n${(run && run.stderr) || ''}`;
    if (run && run.status === 0 && combined.includes(PREFLIGHT_SENTINEL)) {
      return { ok: true, code: null, glMode: glConfig.mode, engineUsed: 'BLENDER_EEVEE_NEXT', durationMs: 0, diagnostic: {}, reason: 'Preflight passed (injected).' };
    }
    const glFail = looksLikeGlContextFailure(combined);
    return {
      ok: false,
      code: glFail ? 'EEVEE_CONTEXT_FAILED' : 'BLENDER_PREFLIGHT_FAILED',
      glMode: glConfig.mode,
      engineUsed: null,
      durationMs: 0,
      diagnostic: {},
      reason: glFail ? 'GL/EGL context creation failed.' : 'Preflight render failed.',
    };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-preflight-'));
  const scriptPath = path.join(dir, 'preflight.py');
  const outPath = path.join(dir, 'preflight.png');
  fs.writeFileSync(scriptPath, PREFLIGHT_PY);

  const sourceEnv = opts.env || process.env;
  const childEnv = applyHeadlessGlEnv(
    buildRenderSubprocessEnvironment(
      { PATH: sourceEnv.PATH || process.env.PATH || '/usr/bin', ...sourceEnv },
      {
        DDP_PREFLIGHT_OUT: outPath,
        DDP_PREFLIGHT_ENGINE: opts.engine || 'BLENDER_EEVEE_NEXT',
      },
    ),
    glConfig,
  );

  // First confirm the binary runs at all (classifies BLENDER_BINARY_FAILURE early).
  const version = runInstrumented(blenderBin, ['--version'], { timeout: 15_000, env: childEnv });
  if (version.status !== 0) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    return {
      ok: false,
      code: 'BLENDER_NOT_FOUND',
      glMode: glConfig.mode,
      engineUsed: null,
      durationMs: version.diagnostic.runtimeMs,
      diagnostic: { glConfig, version: version.diagnostic },
      reason: `Blender binary not runnable: ${blenderBin}`,
    };
  }

  const run = runInstrumented(
    blenderBin,
    ['--background', '--factory-startup', '--python', scriptPath],
    { timeout: timeoutMs, env: childEnv },
  );
  const combined = `${run.stdout}\n${run.stderr}`;
  const engineMatch = combined.match(/DDP_PREFLIGHT_ENGINE_USED=(\S+)/);
  const engineUsed = engineMatch ? engineMatch[1] : null;
  const ok = run.status === 0 && combined.includes(PREFLIGHT_SENTINEL) && fs.existsSync(outPath) && fs.statSync(outPath).size > 0;

  let code = null;
  let reason = 'Blender headless preflight passed.';
  if (!ok) {
    if (run.diagnostic.timedOut) {
      code = 'BLENDER_PREFLIGHT_FAILED';
      reason = `Preflight timed out after ${timeoutMs}ms.`;
    } else if (looksLikeGlContextFailure(combined)) {
      code = 'EEVEE_CONTEXT_FAILED';
      reason = 'GL/EGL context creation failed during headless EEVEE preflight.';
    } else {
      code = 'BLENDER_PREFLIGHT_FAILED';
      reason = `Preflight render did not complete (exit ${run.status}).`;
    }
  }

  const outputBytes = ok ? fs.statSync(outPath).size : 0;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }

  return {
    ok,
    code,
    glMode: glConfig.mode,
    engineUsed,
    durationMs: run.diagnostic.runtimeMs,
    outputBytes,
    diagnostic: { glConfig, version: version.diagnostic, render: run.diagnostic },
    reason,
  };
}

module.exports = { runBlenderPreflight, looksLikeGlContextFailure, PREFLIGHT_SENTINEL, PREFLIGHT_PY };
