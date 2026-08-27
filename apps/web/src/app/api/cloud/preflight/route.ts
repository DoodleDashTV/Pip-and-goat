import { NextResponse } from 'next/server';
import { buildPreDeploymentReport, secretPresenceReport } from '@doodle-dash/production';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

function binOk(bin: string) {
  return spawnSync(bin, ['-version'], { encoding: 'utf8' }).status === 0;
}

function gitOutput(args: string[]) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return typeof result.stdout === 'string' ? result.stdout.trim() : '';
}

export async function GET() {
  const branch = gitOutput(['branch', '--show-current']) || process.env.VERCEL_GIT_COMMIT_REF || 'unknown';
  const sha = gitOutput(['rev-parse', 'HEAD']) || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
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
