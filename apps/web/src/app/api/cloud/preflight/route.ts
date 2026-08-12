import { NextResponse } from 'next/server';
import { buildPreDeploymentReport, secretPresenceReport } from '@doodle-dash/production';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

function binOk(bin: string) {
  return spawnSync(bin, ['-version'], { encoding: 'utf8' }).status === 0;
}

export async function GET() {
  const branch =
    spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim() || 'unknown';
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || 'unknown';
  const workerImageReady =
    existsSync(path.resolve(process.cwd(), '../../workers/runpod-blender/Dockerfile')) ||
    existsSync(path.resolve(process.cwd(), 'workers/runpod-blender/Dockerfile'));

  const report = await buildPreDeploymentReport({
    branch,
    sha,
    workerImageReady,
    ffmpegOk: binOk('ffmpeg'),
    ffprobeOk: binOk('ffprobe'),
    r2LiveTest: null,
  });

  return NextResponse.json({
    report,
    secretsPresent: secretPresenceReport(),
    paidGpuCreated: 'NO',
    gpuBillingStarted: 'NO',
  });
}
