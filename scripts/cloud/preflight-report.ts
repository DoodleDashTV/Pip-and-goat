#!/usr/bin/env tsx
/**
 * Cloud production engine pre-deployment report (Phase 21).
 * Never starts paid GPUs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildPreDeploymentReport } from '../../packages/production/src/cloud/preflight';

function binOk(bin: string) {
  const res = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  return res.status === 0;
}

function repoRoot(): string {
  const fromGit = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (fromGit.status === 0 && fromGit.stdout.trim()) return fromGit.stdout.trim();
  return path.resolve(__dirname, '../..');
}

async function main() {
  const root = repoRoot();
  const branch = spawnSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
    cwd: root,
  }).stdout.trim();
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: root }).stdout.trim();
  const workerImageReady =
    existsSync(path.join(root, 'workers/runpod-blender/Dockerfile')) &&
    existsSync(path.join(root, 'workers/runpod-blender/src/worker.js')) &&
    existsSync(path.join(root, 'workers/runpod-blender/src/gpu-health.js')) &&
    existsSync(path.join(root, 'workers/runpod-blender/src/idle-shutdown.js')) &&
    existsSync(path.join(root, 'workers/runpod-blender/README.md'));

  let r2LiveTest: {
    auth: boolean;
    upload: boolean;
    download: boolean;
    checksum: boolean;
    deleted: boolean;
  } | null = null;

  const hasR2 =
    Boolean(process.env.R2_BUCKET || process.env.OBJECT_STORAGE_BUCKET) &&
    Boolean(process.env.R2_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT) &&
    Boolean(process.env.R2_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID) &&
    Boolean(process.env.R2_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY);

  if (hasR2) {
    const res = spawnSync(
      'pnpm',
      ['--filter', '@doodle-dash/database', 'exec', 'tsx', path.join(root, 'scripts/cloud/r2-connection-test.ts')],
      {
        encoding: 'utf8',
        env: process.env,
        cwd: root,
      },
    );
    const out = `${res.stdout}\n${res.stderr}`;
    r2LiveTest = {
      auth: /R2 AUTH: PASS/.test(out),
      upload: /R2 UPLOAD: PASS/.test(out),
      download: /R2 DOWNLOAD: PASS/.test(out),
      checksum: /R2 CHECKSUM: PASS/.test(out),
      deleted: /R2 DELETE: PASS/.test(out),
    };
  }

  const report = await buildPreDeploymentReport({
    branch,
    sha,
    workerImageReady,
    ffmpegOk: binOk('ffmpeg'),
    ffprobeOk: binOk('ffprobe'),
    r2LiveTest,
  });

  console.log(JSON.stringify(report, null, 2));
  console.log('\n===== PRE-DEPLOYMENT SUMMARY =====');
  console.log(`DDP CLOUD PRODUCTION ENGINE: ${report.overall}`);
  console.log(`CURRENT BRANCH: ${report.currentBranch}`);
  console.log(`CURRENT SHA: ${report.currentSha}`);
  for (const [k, v] of Object.entries(report.gates)) {
    if (
      k === 'overall' ||
      k === 'LOCAL_HEALTH_OPTIONAL' ||
      k === 'COST_GUARD_DEFAULTS' ||
      k === 'GUARD_ALLOWS_VALID'
    ) {
      continue;
    }
    console.log(`${k}: ${v}`);
  }
  console.log(`PAID GPU CREATED: ${report.paidGpuCreated}`);
  console.log(`GPU BILLING STARTED: ${report.gpuBillingStarted}`);
  console.log(`READY FOR FIRST GPU DEPLOYMENT: ${report.readyForFirstGpuDeployment}`);
  console.log('REMAINING BLOCKERS:');
  for (const b of report.remainingBlockers) console.log(` - ${b}`);
}

main().catch((e) => {
  console.error(String(e.message || e).replace(/\brpa_[A-Za-z0-9]+/g, '[REDACTED]'));
  process.exit(1);
});
