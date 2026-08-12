/**
 * Health check entry — used by Docker HEALTHCHECK and worker startup.
 */
const { spawnSync } = require('node:child_process');

function binOk(bin) {
  const res = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  return res.status === 0;
}

function main() {
  const ffmpeg = binOk('ffmpeg');
  const ffprobe = binOk('ffprobe');
  const blender = binOk('blender');
  // On non-GPU hosts (image build/CI), skip nvidia requirement for static check.
  const requireGpu = String(process.env.REQUIRE_GPU_HEALTH || 'false').toLowerCase() === 'true';
  let gpu = { ok: true, skipped: true };
  if (requireGpu) {
    // eslint-disable-next-line global-require
    gpu = require('./gpu-health').evaluateHealth();
  }
  const ok = ffmpeg && ffprobe && blender && gpu.ok;
  const report = {
    ok,
    ffmpeg,
    ffprobe,
    blender,
    gpu,
    stage: ok ? 'WORKER_READY' : 'FAILED',
  };
  console.log(JSON.stringify(report));
  process.exit(ok ? 0 : 1);
}

main();
