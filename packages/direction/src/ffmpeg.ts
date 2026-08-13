/**
 * The sound plan, compiled into an FFmpeg command.
 *
 * Step 8 claims "FFmpeg-compatible final assembly". The only way to make that claim
 * checkable rather than aspirational is to emit the actual command and run it, so
 * this module compiles a `ShotAudioAssembly` into argv.
 *
 * It is pure string building — no spawning, no filesystem — which keeps the package's
 * no-I/O rule intact and lets the graph be asserted in a unit test. The harness in
 * `scripts/direction/validate-scene.ts` is what executes it.
 *
 * Two source modes:
 *
 * - `real` resolves each track to the file the provider layer cached for it. This is
 *   the shape production assembly uses.
 * - `synthetic` substitutes lavfi generators of the right duration. Nothing is
 *   downloaded, no voice is synthesised and no provider is called, which is what
 *   makes the validation harness free and offline while still proving the graph is
 *   executable and the mix hits its loudness target.
 */
import type { AudioTrack, SoundPlan } from './sound';

/** Just enough of the audio projection to compile a mix. */
export type MixInput = {
  readonly shotId: string;
  readonly durationMs: number;
  readonly mixBusTrimDb: number;
  readonly loudness: SoundPlan['loudness'];
  readonly ducking: SoundPlan['ducking'];
  readonly tracks: readonly AudioTrack[];
};

/**
 * What FFmpeg's `loudnorm` measured about a mix on the analysis pass.
 *
 * Loudness normalisation has to be two-pass. Single-pass `loudnorm` adapts as it
 * goes and cannot converge on material a few seconds long — a 2.5-second shot came
 * out ~3 LU hot in exactly that way. Measuring first and then applying a fixed
 * correction is both accurate and deterministic, which single-pass is neither.
 */
export type LoudnormMeasurement = {
  readonly input_i: string;
  readonly input_tp: string;
  readonly input_lra: string;
  readonly input_thresh: string;
  readonly target_offset: string;
};

export type MixOptions = {
  readonly outputPath: string;
  /** `synthetic` needs no assets at all; `real` needs one path per track. */
  readonly sourceMode?: 'synthetic' | 'real';
  /** trackId → local file path. Required for `real`. */
  readonly resolvedSources?: Readonly<Record<string, string>>;
  readonly sampleRate?: number;
  /** Emit `-y`. On by default so the harness is rerunnable. */
  readonly overwrite?: boolean;
  /**
   * Analysis-pass result. Supply it to normalise exactly; omit it and the graph
   * runs in the adaptive single-pass mode, which is only appropriate for analysis.
   */
  readonly measurement?: LoudnormMeasurement;
};

export type MixCommand = {
  readonly args: readonly string[];
  readonly filterGraph: string;
  readonly outputPath: string;
  readonly durationSeconds: number;
  /** One entry per track, in argv order, for the evidence record. */
  readonly inputs: ReadonlyArray<{ readonly trackId: string; readonly kind: string; readonly source: string }>;
};

/**
 * A recognisable tone per track kind, so a human listening to a synthetic mix can
 * tell the layers apart, and so each track contributes real signal to the loudness
 * measurement rather than silence.
 */
const SYNTHETIC_TONE_HZ: Readonly<Record<string, number>> = {
  DIALOGUE: 220,
  NARRATION: 196,
  MUSIC: 330,
  AMBIENCE: 110,
  FOLEY: 660,
  FOOTSTEP: 880,
  PROP: 990,
  VFX: 1320,
  TRANSITION: 1480,
};

function syntheticSource(track: AudioTrack, sampleRate: number): string[] {
  const seconds = Math.max(track.durationMs, 1) / 1000;
  // SILENCE is planned as silence on purpose (a hold, a gap); generating a tone for
  // it would misrepresent the mix.
  if (track.source.kind === 'SILENCE') {
    return ['-f', 'lavfi', '-t', seconds.toFixed(3), '-i', `anullsrc=r=${sampleRate}:cl=stereo`];
  }
  const hz = SYNTHETIC_TONE_HZ[track.kind] ?? 440;
  return [
    '-f',
    'lavfi',
    '-t',
    seconds.toFixed(3),
    '-i',
    `sine=frequency=${hz}:sample_rate=${sampleRate}:duration=${seconds.toFixed(3)}`,
  ];
}

/** ffmpeg wants one delay per channel, and the graph here is stereo throughout. */
function adelayFor(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  return `adelay=${clamped}|${clamped}`;
}

/**
 * Ducking as an enable-gated volume, one clause per region.
 *
 * Dialogue (`duckPriority === 0`) is what ducking exists to protect, so it is never
 * itself ducked. Everything else is attenuated for exactly the planned windows,
 * which is what keeps dialogue intelligible over a music bed.
 */
function duckingFilters(track: AudioTrack, ducking: MixInput['ducking']): string[] {
  if (track.duckPriority === 0 || ducking.length === 0) return [];
  return ducking.map((region) => {
    const start = (region.startMs / 1000).toFixed(3);
    const end = (region.endMs / 1000).toFixed(3);
    return `volume=volume=${region.attenuationDb}dB:enable='between(t,${start},${end})'`;
  });
}

/**
 * Compile one shot's audio plan into an FFmpeg invocation.
 *
 * The chain per track is delay → gain → ducking → fades, then everything is summed
 * with `amix`, limited to the planned true peak, and normalised to the planned LUFS.
 * The bus trim is folded into each track's gain rather than applied after the sum,
 * because that is where the planner budgeted it: trimming after `amix` would already
 * have clipped.
 */
export function buildFfmpegMixCommand(input: MixInput, options: MixOptions): MixCommand {
  const sampleRate = options.sampleRate ?? 48_000;
  const sourceMode = options.sourceMode ?? 'synthetic';
  const durationSeconds = input.durationMs / 1000;

  // Sorted for determinism: two runs of the same plan must produce the same argv.
  const tracks = [...input.tracks].sort((a, b) => a.trackId.localeCompare(b.trackId));
  if (tracks.length === 0) {
    throw new Error(`Shot ${input.shotId} has no audio tracks; nothing to assemble.`);
  }

  const args: string[] = [];
  if (options.overwrite ?? true) args.push('-y');
  args.push('-hide_banner', '-nostdin');

  const inputs: Array<{ trackId: string; kind: string; source: string }> = [];
  for (const track of tracks) {
    if (sourceMode === 'synthetic') {
      args.push(...syntheticSource(track, sampleRate));
      inputs.push({
        trackId: track.trackId,
        kind: track.kind,
        source: track.source.kind === 'SILENCE' ? 'lavfi:anullsrc' : 'lavfi:sine',
      });
      continue;
    }
    const resolved = options.resolvedSources?.[track.trackId];
    if (!resolved) {
      // Fail closed: a real assembly missing an artifact must stop, not silently
      // mix a shorter film. This is the missing-audio detection Step 8 requires.
      throw new Error(
        `Track ${track.trackId} (${track.kind}) has no resolved source. Real assembly requires one path per track.`,
      );
    }
    args.push('-i', resolved);
    inputs.push({ trackId: track.trackId, kind: track.kind, source: resolved });
  }

  const chains: string[] = [];
  tracks.forEach((track, index) => {
    const filters = [
      adelayFor(track.startMs + track.offsetMs),
      `volume=${(track.gainDb + input.mixBusTrimDb).toFixed(2)}dB`,
      ...duckingFilters(track, input.ducking),
    ];
    if (track.fadeInMs > 0) {
      filters.push(`afade=t=in:st=${((track.startMs + track.offsetMs) / 1000).toFixed(3)}:d=${(track.fadeInMs / 1000).toFixed(3)}`);
    }
    if (track.fadeOutMs > 0) {
      const fadeStart = Math.max(0, track.startMs + track.offsetMs + track.durationMs - track.fadeOutMs) / 1000;
      filters.push(`afade=t=out:st=${fadeStart.toFixed(3)}:d=${(track.fadeOutMs / 1000).toFixed(3)}`);
    }
    // Pad every branch to the full shot length so `amix` cannot end the mix early
    // on its shortest input.
    filters.push(`apad=whole_dur=${durationSeconds.toFixed(3)}`);
    chains.push(`[${index}:a]${filters.join(',')}[t${index}]`);
  });

  const labels = tracks.map((_, index) => `[t${index}]`).join('');
  chains.push(
    `${labels}amix=inputs=${tracks.length}:duration=longest:dropout_transition=0:normalize=0[mixed]`,
  );

  const loudnorm = [
    `loudnorm=I=${input.loudness.targetLufs}`,
    `TP=${input.loudness.truePeakDb}`,
    'LRA=7',
    'print_format=json',
  ];
  if (options.measurement) {
    // `linear=true` with a measurement applies one fixed gain to the whole mix,
    // which is both exact and deterministic.
    loudnorm.push(
      'linear=true',
      `measured_I=${options.measurement.input_i}`,
      `measured_TP=${options.measurement.input_tp}`,
      `measured_LRA=${options.measurement.input_lra}`,
      `measured_thresh=${options.measurement.input_thresh}`,
      `offset=${options.measurement.target_offset}`,
    );
  }
  // Limiter after normalisation, so it catches whatever the fixed gain pushed up
  // rather than being undone by it.
  chains.push(
    `[mixed]${loudnorm.join(':')},` +
      `alimiter=limit=${dbToLinear(input.loudness.truePeakDb).toFixed(6)}:level=disabled[out]`,
  );

  const filterGraph = chains.join(';');
  args.push('-filter_complex', filterGraph, '-map', '[out]', '-t', durationSeconds.toFixed(3));

  if (options.outputPath === NULL_SINK) {
    // Analysis pass: decode and measure, write nothing.
    args.push('-f', 'null', '-');
  } else {
    args.push('-ar', String(sampleRate), '-ac', '2', '-c:a', 'pcm_s16le', options.outputPath);
  }

  return { args, filterGraph, outputPath: options.outputPath, durationSeconds, inputs };
}

/** Output path that means "measure, do not write". */
export const NULL_SINK = '-';

/**
 * The analysis pass: the same graph, measured instead of written.
 *
 * Using the identical graph matters — measuring a different mix than the one being
 * written would produce a confidently wrong correction.
 */
export function buildFfmpegAnalysisCommand(
  input: MixInput,
  options: Omit<MixOptions, 'outputPath' | 'measurement'> = {},
): MixCommand {
  return buildFfmpegMixCommand(input, { ...options, outputPath: NULL_SINK });
}

/**
 * Pull the `loudnorm` JSON block out of FFmpeg's stderr.
 *
 * Returns null rather than throwing: a caller that cannot measure should report an
 * unnormalised mix, not crash.
 */
export function parseLoudnormMeasurement(stderr: string): LoudnormMeasurement | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(stderr.slice(start, end + 1)) as Partial<LoudnormMeasurement>;
    if (
      parsed.input_i == null ||
      parsed.input_tp == null ||
      parsed.input_lra == null ||
      parsed.input_thresh == null ||
      parsed.target_offset == null
    ) {
      return null;
    }
    return parsed as LoudnormMeasurement;
  } catch {
    return null;
  }
}

/** dBFS to linear amplitude, which is what `alimiter=limit` expects. */
export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}
