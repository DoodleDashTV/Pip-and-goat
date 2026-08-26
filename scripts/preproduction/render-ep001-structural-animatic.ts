/**
 * Render the deterministic, silent EP001 structural animatic locally.
 *
 * This command uses only FFmpeg color slates and text. It performs no network
 * calls, paid requests, remote storage mutations, or Production writes.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileEp001StructuralAnimatic,
  compileEp001StructuralAnimaticCommand,
} from '../../apps/web/src/lib/tivvlejoy-ep001-structural-animatic';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.resolve(
  process.argv[2] ??
    path.join(
      repoRoot,
      'artifacts/tivvlejoy-ep001-structural-animatic/EP001_structural_animatic.mp4',
    ),
);
const outputDirectory = path.dirname(outputPath);
const fontCandidates = [
  '/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];
const fontFile = fontCandidates.find(existsSync);
if (!fontFile) throw new Error('EP001_ANIMATIC_FONT_NOT_FOUND');

mkdirSync(outputDirectory, { recursive: true });
const animatic = compileEp001StructuralAnimatic();
const command = compileEp001StructuralAnimaticCommand({ outputPath, fontFile, animatic });
const render = spawnSync('ffmpeg', command.args, {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (render.status !== 0) {
  const detail = (render.stderr || render.stdout || 'unknown FFmpeg failure').slice(-12_000);
  throw new Error(`EP001_ANIMATIC_RENDER_FAILED:${detail}`);
}

const probe = spawnSync(
  'ffprobe',
  [
    '-v',
    'error',
    '-count_frames',
    '-show_entries',
    'format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_read_frames',
    '-of',
    'json',
    outputPath,
  ],
  { cwd: repoRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
if (probe.status !== 0) {
  throw new Error(`EP001_ANIMATIC_PROBE_FAILED:${(probe.stderr || '').slice(-1_000)}`);
}

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  nb_read_frames?: string;
};
const probeData = JSON.parse(probe.stdout || '{}') as {
  format?: { duration?: string; size?: string };
  streams?: ProbeStream[];
};
const streams = probeData.streams ?? [];
const video = streams.find((stream) => stream.codec_type === 'video');
const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
const durationSeconds = Number(probeData.format?.duration ?? 0);
const frameCount = Number(video?.nb_read_frames ?? 0);
const [rateNumerator, rateDenominator] = (video?.r_frame_rate ?? '0/1').split('/').map(Number);
const fps = rateDenominator ? rateNumerator / rateDenominator : 0;
const checks = {
  outputExists: existsSync(outputPath),
  durationExact: Math.abs(durationSeconds - animatic.renderContract.durationSeconds) <= 0.05,
  frameCountExact: frameCount === animatic.renderContract.totalFrames,
  widthExact: video?.width === animatic.renderContract.width,
  heightExact: video?.height === animatic.renderContract.height,
  fpsExact: fps === animatic.renderContract.fps,
  videoPresent: video?.codec_type === 'video',
  audioAbsent: audioStreams.length === 0,
};
if (Object.values(checks).some((passed) => !passed)) {
  throw new Error(`EP001_ANIMATIC_PROOF_FAILED:${JSON.stringify(checks)}`);
}

const outputSha256 = createHash('sha256').update(readFileSync(outputPath)).digest('hex');
const report = {
  schemaVersion: 'TIVVLEJOY_EP001_STRUCTURAL_ANIMATIC_RENDER_PROOF_V1',
  status: 'PASS',
  outputPath,
  outputBytes: statSync(outputPath).size,
  outputSha256,
  structuralAnimaticSha256: animatic.structuralAnimaticSha256,
  commandSha256: command.commandSha256,
  durationSeconds,
  frameCount,
  width: video?.width,
  height: video?.height,
  fps,
  codec: video?.codec_name,
  audioStreamCount: audioStreams.length,
  checks,
  safety: {
    localStructuralRender: true,
    realMediaIncluded: false,
    networkCalls: 0,
    paidRequests: 0,
    remoteStorageMutations: 0,
    productionMutations: 0,
  },
};
writeFileSync(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(animatic, null, 2)}\n`,
  'utf8',
);
writeFileSync(
  path.join(outputDirectory, 'render-proof.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`${JSON.stringify(report)}\n`);
