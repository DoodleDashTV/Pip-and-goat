import { spawnSync } from 'node:child_process';

export function detectFfmpeg(): { available: boolean; path: string | null } {
  const which = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
  const path = which.status === 0 ? which.stdout.trim() : '';
  return { available: Boolean(path), path: path || null };
}

export function planSyntheticProxyEdit(input: { episodeId: string; shots: Array<{ shotId: string; durationFrames: number }>; fps?: number }): {
  status: 'PROXY_PLANNED' | 'PROXY_MEDIA_TOOL_UNAVAILABLE';
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  tracks: string[];
  finalRender: false;
  usedRealImagery: false;
  usedVoices: false;
} {
  const detected = detectFfmpeg();
  const fps = input.fps ?? 30;
  const durationFrames = input.shots.reduce((sum, shot) => sum + shot.durationFrames, 0);
  return {
    status: detected.available ? 'PROXY_PLANNED' : 'PROXY_MEDIA_TOOL_UNAVAILABLE',
    width: 360,
    height: 640,
    fps,
    durationFrames,
    tracks: ['video-cards', 'tone', 'captions'],
    finalRender: false,
    usedRealImagery: false,
    usedVoices: false,
  };
}

export function runSyntheticProxyIfAvailable(input: { outputPath: string; durationSec?: number }): { status: 'PROXY_WRITTEN' | 'PROXY_MEDIA_TOOL_UNAVAILABLE'; outputPath: string | null } {
  const detected = detectFfmpeg();
  if (!detected.available || !detected.path) {
    return { status: 'PROXY_MEDIA_TOOL_UNAVAILABLE', outputPath: null };
  }
  const seconds = input.durationSec ?? 2;
  const result = spawnSync(
    detected.path,
    ['-y', '-f', 'lavfi', '-i', `color=c=0x335577:s=360x640:d=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest', input.outputPath],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) return { status: 'PROXY_MEDIA_TOOL_UNAVAILABLE', outputPath: null };
  return { status: 'PROXY_WRITTEN', outputPath: input.outputPath };
}
