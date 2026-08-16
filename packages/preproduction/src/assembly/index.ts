/**
 * Pure FFmpeg assembly compiler for pre-production drafts.
 *
 * Builds argv only — no spawn, no filesystem — matching
 * `packages/direction/src/ffmpeg.ts`. The Milestone 5 harness may execute the
 * graph locally when `ffmpeg` is installed. Nothing here writes
 * production-library or requests a paid provider.
 *
 * Video: lavfi color holds at the animatic resolution (360×640), 30 fps, with
 * a burned proxy banner. Audio: synthetic sine / silence beds. Locked voices
 * are never synthesised or cloned.
 */
import { z } from 'zod';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { PROXY_WATERMARK } from '../proxy';
import type { AnimaticPlan } from '../animatic';
import type { AudioPlan } from '../audio';

export const AssemblyCommandSchema = z.object({
  kind: z.enum(['ANIMATIC', 'AUDIO_MIX', 'DRAFT_MUX']),
  args: z.array(z.string()).min(1),
  filterGraph: z.string(),
  outputPath: z.string(),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.literal(30).optional(),
  watermark: z.string().optional(),
  paid: z.literal(false),
  writesProductionLibrary: z.literal(false),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.assembly),
});
export type AssemblyCommand = z.infer<typeof AssemblyCommandSchema>;

const SYNTHETIC_TONE_HZ: Readonly<Record<string, number>> = {
  DIALOGUE: 220,
  NARRATION: 196,
  MUSIC: 330,
  AMBIENCE: 110,
  FOLEY: 660,
  PLACEHOLDER: 0,
};

function assertSafeOutputPath(outputPath: string): void {
  if (outputPath.includes('production-library')) {
    throw new Error('Refuse: assembly cannot write production-library/.');
  }
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
}

function parseResolution(resolution: string): { width: number; height: number } {
  const [width, height] = resolution.split('x').map((part) => Number(part));
  if (!width || !height) {
    throw new Error(`Refuse: unsupported animatic resolution "${resolution}".`);
  }
  return { width, height };
}

export function compileAnimaticAssembly(input: {
  animatic: AnimaticPlan;
  audio: AudioPlan;
  outputPath: string;
  overwrite?: boolean;
  /** Optional font for `drawtext`. Omitted graphs still carry the watermark string. */
  fontFile?: string;
}): AssemblyCommand {
  assertSafeOutputPath(input.outputPath);
  if (input.animatic.renderTier !== 'DRAFT') {
    throw new Error('Refuse: assembly only accepts DRAFT animatics.');
  }
  if (input.audio.tracks.some((track) => track.requiresPaidProvider)) {
    throw new Error('Refuse: assembly cannot use a paid audio provider.');
  }

  const { width, height } = parseResolution(input.animatic.resolution);
  const fps = input.animatic.fps;
  const durationSeconds = input.animatic.totalFrames / fps;
  const watermark = input.animatic.clips.find((clip) => clip.watermark)?.watermark;

  const args: string[] = [];
  if (input.overwrite ?? true) args.push('-y');
  args.push('-hide_banner', '-nostdin');

  for (const clip of input.animatic.clips) {
    const seconds = Math.max(clip.holdFrames, 1) / fps;
    args.push(
      '-f',
      'lavfi',
      '-t',
      seconds.toFixed(3),
      '-i',
      `color=c=0x1a1a2e:s=${width}x${height}:d=${seconds.toFixed(3)}:r=${fps}`,
    );
  }

  const chains: string[] = [];
  input.animatic.clips.forEach((clip, index) => {
    const filters = [
      `scale=${width}:${height}`,
      'drawbox=x=0:y=0:w=iw:h=48:color=red@0.55:t=fill',
    ];
    if (clip.watermark) {
      const font = input.fontFile ? `:fontfile=${input.fontFile}` : '';
      filters.push(
        `drawtext=text='${escapeDrawtext(clip.watermark)}':fontsize=16:fontcolor=white:x=16:y=14${font}`,
      );
    }
    chains.push(`[${index}:v]${filters.join(',')}[v${index}]`);
  });
  const concatIn = input.animatic.clips.map((_, index) => `[v${index}]`).join('');
  chains.push(`${concatIn}concat=n=${input.animatic.clips.length}:v=1:a=0[vout]`);

  const filterGraph = chains.join(';');
  args.push(
    '-filter_complex',
    filterGraph,
    '-map',
    '[vout]',
    '-an',
    '-c:v',
    'mpeg4',
    '-q:v',
    '8',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    input.outputPath,
  );

  return AssemblyCommandSchema.parse({
    kind: 'ANIMATIC',
    args,
    filterGraph,
    outputPath: input.outputPath,
    durationSeconds,
    width,
    height,
    fps,
    watermark,
    paid: false,
    writesProductionLibrary: false,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.assembly,
  });
}

export function compileAudioMix(input: {
  audio: AudioPlan;
  durationSeconds: number;
  outputPath: string;
  overwrite?: boolean;
  sampleRate?: number;
}): AssemblyCommand {
  assertSafeOutputPath(input.outputPath);
  if (input.audio.tracks.some((track) => track.requiresPaidProvider)) {
    throw new Error('Refuse: audio mix cannot use a paid provider.');
  }
  if (!input.audio.lockedVoicesUntouched) {
    throw new Error('Refuse: audio mix requires lockedVoicesUntouched.');
  }

  const sampleRate = input.sampleRate ?? 48_000;
  const durationSeconds = input.durationSeconds;
  const tracks = [...input.audio.tracks].sort((a, b) => a.trackId.localeCompare(b.trackId));
  if (tracks.length === 0) {
    throw new Error('Refuse: audio mix has no tracks.');
  }

  const args: string[] = [];
  if (input.overwrite ?? true) args.push('-y');
  args.push('-hide_banner', '-nostdin');

  for (const track of tracks) {
    const hz = SYNTHETIC_TONE_HZ[track.kind] ?? 0;
    // Dialogue / narration / placeholder stay silent so locked voices are never synthesised.
    if (track.kind === 'PLACEHOLDER' || track.kind === 'DIALOGUE' || track.kind === 'NARRATION' || hz === 0) {
      args.push(
        '-f',
        'lavfi',
        '-t',
        durationSeconds.toFixed(3),
        '-i',
        `anullsrc=r=${sampleRate}:cl=stereo`,
      );
      continue;
    }
    args.push(
      '-f',
      'lavfi',
      '-t',
      durationSeconds.toFixed(3),
      '-i',
      `sine=frequency=${hz}:sample_rate=${sampleRate}:duration=${durationSeconds.toFixed(3)}`,
    );
  }

  const chains = tracks.map((track, index) => {
    const volume = `volume=${track.gainDb.toFixed(2)}dB`;
    return `[${index}:a]${volume},apad=whole_dur=${durationSeconds.toFixed(3)}[t${index}]`;
  });
  const labels = tracks.map((_, index) => `[t${index}]`).join('');
  chains.push(
    `${labels}amix=inputs=${tracks.length}:duration=longest:dropout_transition=0:normalize=0[out]`,
  );
  const filterGraph = chains.join(';');

  args.push(
    '-filter_complex',
    filterGraph,
    '-map',
    '[out]',
    '-t',
    durationSeconds.toFixed(3),
    '-ar',
    String(sampleRate),
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    input.outputPath,
  );

  return AssemblyCommandSchema.parse({
    kind: 'AUDIO_MIX',
    args,
    filterGraph,
    outputPath: input.outputPath,
    durationSeconds,
    paid: false,
    writesProductionLibrary: false,
    watermark: tracks.some((track) => track.kind === 'PLACEHOLDER') ? PROXY_WATERMARK : undefined,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.assembly,
  });
}

/**
 * One local draft MP4: 9:16 color holds + synthetic non-voice audio + mux.
 * Dialogue tracks are silence. Music / ambience / foley are tones. No locked
 * voice is synthesised.
 */
export function compileDraftMux(input: {
  animatic: AnimaticPlan;
  audio: AudioPlan;
  outputPath: string;
  overwrite?: boolean;
  fontFile?: string;
  sampleRate?: number;
}): AssemblyCommand {
  assertSafeOutputPath(input.outputPath);
  if (input.animatic.renderTier !== 'DRAFT') {
    throw new Error('Refuse: draft mux only accepts DRAFT animatics.');
  }
  if (input.audio.tracks.some((track) => track.requiresPaidProvider)) {
    throw new Error('Refuse: draft mux cannot use a paid audio provider.');
  }
  if (!input.audio.lockedVoicesUntouched) {
    throw new Error('Refuse: draft mux requires lockedVoicesUntouched.');
  }

  const { width, height } = parseResolution(input.animatic.resolution);
  const fps = input.animatic.fps;
  const durationSeconds = input.animatic.totalFrames / fps;
  const sampleRate = input.sampleRate ?? 48_000;
  const watermark = input.animatic.clips.find((clip) => clip.watermark)?.watermark;
  const tracks = [...input.audio.tracks].sort((a, b) => a.trackId.localeCompare(b.trackId));

  const args: string[] = [];
  if (input.overwrite ?? true) args.push('-y');
  args.push('-hide_banner', '-nostdin');

  for (const clip of input.animatic.clips) {
    const seconds = Math.max(clip.holdFrames, 1) / fps;
    args.push(
      '-f',
      'lavfi',
      '-t',
      seconds.toFixed(3),
      '-i',
      `color=c=0x1a1a2e:s=${width}x${height}:d=${seconds.toFixed(3)}:r=${fps}`,
    );
  }

  for (const track of tracks) {
    const hz = SYNTHETIC_TONE_HZ[track.kind] ?? 0;
    const silent =
      track.kind === 'PLACEHOLDER' || track.kind === 'DIALOGUE' || track.kind === 'NARRATION' || hz === 0;
    args.push(
      '-f',
      'lavfi',
      '-t',
      durationSeconds.toFixed(3),
      '-i',
      silent
        ? `anullsrc=r=${sampleRate}:cl=stereo`
        : `sine=frequency=${hz}:sample_rate=${sampleRate}:duration=${durationSeconds.toFixed(3)}`,
    );
  }

  const chains: string[] = [];
  input.animatic.clips.forEach((clip, index) => {
    const filters = [
      `scale=${width}:${height}`,
      'drawbox=x=0:y=0:w=iw:h=48:color=red@0.55:t=fill',
    ];
    if (clip.watermark) {
      const font = input.fontFile ? `:fontfile=${input.fontFile}` : '';
      filters.push(
        `drawtext=text='${escapeDrawtext(clip.watermark)}':fontsize=16:fontcolor=white:x=16:y=14${font}`,
      );
    }
    chains.push(`[${index}:v]${filters.join(',')}[v${index}]`);
  });
  const concatIn = input.animatic.clips.map((_, index) => `[v${index}]`).join('');
  chains.push(`${concatIn}concat=n=${input.animatic.clips.length}:v=1:a=0[vout]`);

  const audioOffset = input.animatic.clips.length;
  tracks.forEach((track, index) => {
    chains.push(
      `[${audioOffset + index}:a]volume=${track.gainDb.toFixed(2)}dB,apad=whole_dur=${durationSeconds.toFixed(3)}[t${index}]`,
    );
  });
  const labels = tracks.map((_, index) => `[t${index}]`).join('');
  chains.push(
    `${labels}amix=inputs=${tracks.length}:duration=longest:dropout_transition=0:normalize=0[aout]`,
  );

  const filterGraph = chains.join(';');
  args.push(
    '-filter_complex',
    filterGraph,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'mpeg4',
    '-q:v',
    '8',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-ar',
    String(sampleRate),
    '-ac',
    '2',
    '-shortest',
    input.outputPath,
  );

  return AssemblyCommandSchema.parse({
    kind: 'DRAFT_MUX',
    args,
    filterGraph,
    outputPath: input.outputPath,
    durationSeconds,
    width,
    height,
    fps,
    watermark,
    paid: false,
    writesProductionLibrary: false,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.assembly,
  });
}
