/**
 * GPU / Blender health for the Runpod worker.
 *
 * Fails closed if EEVEE cannot render with hardware acceleration, BUT the health
 * benchmark itself must be renderable: the previous benchmark scene contained a
 * cube and NO CAMERA, so `bpy.ops.render.render()` ALWAYS threw
 * "Cannot render, no camera" — making benchmarkOk permanently false and
 * crash-looping every paid pod. The benchmark now builds a complete minimal
 * scene (camera + sun + mesh) via the shared Blender preflight and applies the
 * supported headless GL/EGL configuration.
 *
 * A GL/EGL/context failure is classified explicitly as EEVEE_CONTEXT_FAILED and
 * never silently masked. A diagnostic-only CPU fallback is available (records
 * hardwareAcceleration:false, never fakes GPU acceleration).
 */
const { spawnSync } = require('node:child_process');
const os = require('node:os');

const { runBlenderPreflight } = require('./blender-preflight');
const { resolveHeadlessGlConfig } = require('./headless-gl');
const { buildRenderSubprocessEnvironment } = require('./child-env');

function diagnosticChildEnv(sourceEnv = process.env) {
  return buildRenderSubprocessEnvironment({ PATH: sourceEnv.PATH || process.env.PATH, ...sourceEnv });
}

function parseNvidiaSmi(sourceEnv = process.env) {
  const res = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
    { encoding: 'utf8', timeout: 15_000, env: diagnosticChildEnv(sourceEnv) },
  );
  if (res.status !== 0) {
    return { gpuModel: null, vramGb: null, error: res.stderr || 'nvidia-smi failed' };
  }
  const line = (res.stdout || '').trim().split('\n')[0] || '';
  const parts = line.split(',').map((p) => p.trim());
  const memMiB = Number(parts[1]);
  return {
    gpuModel: parts[0] || null,
    vramGb: Number.isFinite(memMiB) ? Number((memMiB / 1024).toFixed(2)) : null,
  };
}

function blenderVersion(sourceEnv = process.env) {
  const res = spawnSync('blender', ['--version'], { encoding: 'utf8', timeout: 15_000, env: diagnosticChildEnv(sourceEnv) });
  const out = `${res.stdout || ''}\n${res.stderr || ''}`;
  const m = out.match(/Blender\s+([0-9.]+)/i);
  return m ? m[1] : null;
}

/**
 * Tiny EEVEE benchmark — renders a COMPLETE minimal scene (camera + light + mesh)
 * headlessly. Returns { ok, ms, glMode, engineUsed, code, output }.
 */
function runTinyEeveeBenchmark(opts = {}) {
  const started = Date.now();
  const preflightFn = opts.preflight || runBlenderPreflight;
  const pre = preflightFn({
    env: opts.env || process.env,
    forceSoftware: opts.forceSoftware,
    timeoutMs: opts.timeoutMs ?? 120_000,
    runCommand: opts.runCommand,
  });
  return {
    ok: pre.ok,
    ms: Date.now() - started,
    glMode: pre.glMode,
    engineUsed: pre.engineUsed,
    code: pre.code,
    output: (pre.reason || '') + (pre.diagnostic && pre.diagnostic.render ? ` [${pre.diagnostic.render.stderrTail || ''}]`.slice(0, 500) : ''),
  };
}

/**
 * Evaluate worker health.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.allowCpuFallback] diagnostic-only: pass health without a
 *        GPU as long as Blender + EEVEE init and the benchmark renders. Never
 *        reports hardware acceleration when there is none.
 * @param {Record<string,string|undefined>} [opts.env]
 */
function evaluateHealth(opts = {}) {
  const env = opts.env || process.env;
  const allowCpuFallback =
    opts.allowCpuFallback ?? String(env.ALLOW_CPU_DIAGNOSTIC_FALLBACK || 'false').toLowerCase() === 'true';
  const smi = opts.parseNvidiaSmi ? opts.parseNvidiaSmi() : parseNvidiaSmi(env);
  const version = opts.blenderVersion ? opts.blenderVersion() : blenderVersion(env);
  resolveHeadlessGlConfig({ env, forceSoftware: allowCpuFallback && !smi.gpuModel });
  const bench = runTinyEeveeBenchmark({
    env,
    forceSoftware: allowCpuFallback && !smi.gpuModel,
    preflight: opts.preflight,
    runCommand: opts.runCommand,
  });
  const hardwareAcceleration = Boolean(smi.gpuModel);

  const report = {
    gpuModel: smi.gpuModel || 'UNKNOWN',
    vramGb: smi.vramGb,
    blenderVersion: version,
    eeveeVersion: bench.engineUsed || 'EEVEE',
    os: `${os.type()} ${os.release()}`,
    renderBackend: hardwareAcceleration ? 'CUDA_OR_OPTIX' : 'CPU',
    hardwareAcceleration,
    glMode: bench.glMode,
    benchmarkOk: bench.ok,
    benchmarkMs: bench.ms,
    benchmarkCode: bench.code || null,
    allowCpuFallback,
  };

  // Explicit EEVEE/GL context failure classification (never masked).
  const eeveeContextFailed = bench.code === 'EEVEE_CONTEXT_FAILED';

  const ok = allowCpuFallback
    ? Boolean(bench.ok && version)
    : Boolean(bench.ok && hardwareAcceleration && version);

  let reason;
  if (ok) {
    reason = allowCpuFallback && !hardwareAcceleration
      ? 'Diagnostic CPU fallback healthy (NO hardware acceleration — not for production billing)'
      : 'GPU worker healthy';
  } else if (eeveeContextFailed) {
    reason = 'EEVEE GL/EGL context failed — headless render context unavailable';
  } else if (!bench.ok) {
    reason = `Blender EEVEE benchmark failed (${bench.code || 'unknown'})`;
  } else if (!hardwareAcceleration) {
    reason = 'No GPU / hardware acceleration — refusing paid broken worker';
  } else {
    reason = 'Blender version undetected';
  }

  return { ok, report, reason, eeveeContextFailed, code: eeveeContextFailed ? 'EEVEE_CONTEXT_FAILED' : bench.code || null };
}

module.exports = { parseNvidiaSmi, blenderVersion, runTinyEeveeBenchmark, evaluateHealth };

if (require.main === module) {
  const allowCpuFallback = process.argv.includes('--allow-cpu-fallback');
  const result = evaluateHealth({ allowCpuFallback });
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
