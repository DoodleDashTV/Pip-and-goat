/**
 * GPU / Blender health for Runpod worker (Phase 10).
 * Fails closed if EEVEE cannot render with hardware acceleration.
 */
const { spawnSync } = require('node:child_process');
const { writeFileSync, mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function parseNvidiaSmi() {
  const res = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
    { encoding: 'utf8' },
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

function blenderVersion() {
  const res = spawnSync('blender', ['--version'], { encoding: 'utf8' });
  const out = `${res.stdout || ''}\n${res.stderr || ''}`;
  const m = out.match(/Blender\s+([0-9.]+)/i);
  return m ? m[1] : null;
}

function runTinyEeveeBenchmark() {
  const dir = path.join(os.tmpdir(), `ddp-gpu-bench-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'bench.py');
  const out = path.join(dir, 'frame.png');
  writeFileSync(
    script,
    `
import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'Scene') else 'BLENDER_EEVEE'
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except Exception:
    scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 64
scene.render.resolution_y = 64
scene.render.filepath = r'''${out.replace(/\\/g, '/')}'''
bpy.ops.mesh.primitive_cube_add()
bpy.ops.render.render(write_still=True)
print('DDP_BENCH_OK')
`,
  );
  const started = Date.now();
  const res = spawnSync('blender', ['--background', '--factory-startup', '--python', script], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  const ms = Date.now() - started;
  const combined = `${res.stdout || ''}\n${res.stderr || ''}`;
  const ok = combined.includes('DDP_BENCH_OK') && res.status === 0;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return { ok, ms, output: combined.slice(0, 500) };
}

function evaluateHealth() {
  const smi = parseNvidiaSmi();
  const version = blenderVersion();
  const bench = runTinyEeveeBenchmark();
  const hardwareAcceleration = Boolean(smi.gpuModel);
  const report = {
    gpuModel: smi.gpuModel || 'UNKNOWN',
    vramGb: smi.vramGb,
    blenderVersion: version,
    eeveeVersion: 'EEVEE',
    os: `${os.type()} ${os.release()}`,
    renderBackend: hardwareAcceleration ? 'CUDA_OR_OPTIX' : 'CPU',
    hardwareAcceleration,
    benchmarkOk: bench.ok,
    benchmarkMs: bench.ms,
  };
  const ok = Boolean(bench.ok && hardwareAcceleration && version);
  return {
    ok,
    report,
    reason: ok
      ? 'GPU worker healthy'
      : !hardwareAcceleration
        ? 'No GPU / hardware acceleration — refusing paid broken worker'
        : !bench.ok
          ? 'Blender EEVEE benchmark failed'
          : 'Blender version undetected',
  };
}

module.exports = { parseNvidiaSmi, blenderVersion, runTinyEeveeBenchmark, evaluateHealth };

if (require.main === module) {
  const result = evaluateHealth();
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
