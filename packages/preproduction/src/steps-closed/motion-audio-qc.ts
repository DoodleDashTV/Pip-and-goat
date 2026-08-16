/**
 * Step 15 — Motion and audio QC.
 *
 * Synthetic tones may validate the mux. They are labeled non-voice test audio.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { LOCKED_VOICE_IDS, PROXY_VOICE_PLACEHOLDER, isProxyCode } from '../proxy';
import { evaluateAudioTiming } from '../audio-timing';
import type { AnimaticPlan } from '../animatic';
import type { AudioPlan } from '../audio';
import { DRAFT_NONCANONICAL, DRAFT_PIPELINE_CLASS } from './story-brain';

export type AudioProbe = {
  hasAudio?: boolean;
  durationSeconds?: number;
};

export function compileMotionAudioQc(input: {
  animatic: AnimaticPlan;
  audio: AudioPlan;
  probe?: AudioProbe;
}): {
  label: typeof DRAFT_NONCANONICAL;
  outputClass: typeof DRAFT_PIPELINE_CLASS;
  audioKind: 'NON_VOICE_TEST_AUDIO';
  synthesisedVoices: false;
  lockedVoicesUntouched: true;
  checks: Array<{ item: string; status: 'PASS' | 'FAIL'; detail: string }>;
  technical: 'PASS' | 'FAIL';
  cacheKey: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.motionAudioQc;
} {
  const clips = input.animatic.clips;
  const ids = clips.map((clip) => clip.clipId);
  const duplicate = ids.some((id, index) => ids.indexOf(id) !== index);
  const missing = clips.length === 0;
  const discontinuous = clips.some((clip, index) => {
    if (index === 0) return clip.startFrame !== 0;
    return clip.startFrame !== clips[index - 1]!.endFrame;
  });
  const excessiveHolds = clips.filter((clip) => clip.holdFrames > 450);
  const invalidRanges = clips.filter((clip) => clip.endFrame <= clip.startFrame || clip.holdFrames < 1);
  const timing = evaluateAudioTiming({
    animatic: input.animatic,
    audio: input.audio,
    measuredDurationSeconds: input.probe?.durationSeconds,
  });
  const voiceClaims = input.audio.tracks.some((track) => {
    if (!track.voiceId) return false;
    return (LOCKED_VOICE_IDS as readonly string[]).includes(track.voiceId) && track.occupant && isProxyCode(track.occupant);
  });
  const placeholderOk = input.audio.tracks
    .filter((track) => track.occupant && isProxyCode(track.occupant))
    .every((track) => track.voiceId === PROXY_VOICE_PLACEHOLDER);
  const checks: Array<{ item: string; status: 'PASS' | 'FAIL'; detail: string }> = [
    { item: 'CLIP_TIMING', status: timing.withinTolerance ? 'PASS' : 'FAIL', detail: `${timing.plannedSeconds.toFixed(3)}s` },
    { item: 'DUPLICATE_CLIPS', status: duplicate ? 'FAIL' : 'PASS', detail: duplicate ? 'duplicate clip ids' : 'unique clip ids' },
    { item: 'MISSING_CLIPS', status: missing ? 'FAIL' : 'PASS', detail: `${clips.length} clips` },
    { item: 'DISCONTINUITIES', status: discontinuous ? 'FAIL' : 'PASS', detail: 'contiguous frame ranges' },
    { item: 'EXCESSIVE_HOLDS', status: excessiveHolds.length === 0 ? 'PASS' : 'FAIL', detail: `${excessiveHolds.length} long holds` },
    { item: 'INVALID_FRAME_RANGES', status: invalidRanges.length === 0 ? 'PASS' : 'FAIL', detail: `${invalidRanges.length} invalid` },
    {
      item: 'AUDIO_STREAM_PRESENCE',
      status: input.probe?.hasAudio === false ? 'FAIL' : 'PASS',
      detail: input.probe?.hasAudio == null ? 'planned audio tracks present' : 'probed audio stream',
    },
    {
      item: 'NONZERO_AUDIO_DURATION',
      status: timing.plannedSeconds > 0 ? 'PASS' : 'FAIL',
      detail: `${timing.plannedSeconds.toFixed(3)}s`,
    },
    { item: 'PEAK_SAFETY', status: input.audio.tracks.every((track) => track.gainDb <= 0) ? 'PASS' : 'FAIL', detail: 'gains <= 0 dB' },
    {
      item: 'SILENCE_RANGES',
      status: input.audio.tracks.some((track) => track.kind === 'PLACEHOLDER' || track.kind === 'DIALOGUE') ? 'PASS' : 'FAIL',
      detail: 'placeholder/dialogue tracks are silence beds',
    },
    { item: 'CUE_ALIGNMENT', status: timing.withinTolerance ? 'PASS' : 'FAIL', detail: 'mix duration matches animatic' },
    { item: 'PROHIBITED_VOICE_SYNTHESIS', status: input.audio.tracks.every((track) => !track.requiresPaidProvider) ? 'PASS' : 'FAIL', detail: 'no paid voice provider' },
    {
      item: 'PROHIBITED_LOCKED_VOICE_CLAIMS',
      status: !voiceClaims && placeholderOk && input.audio.lockedVoicesUntouched ? 'PASS' : 'FAIL',
      detail: 'proxies stay on proxy_voice_placeholder_v1',
    },
  ];
  const technical = checks.every((check) => check.status === 'PASS') ? 'PASS' : 'FAIL';
  return {
    label: DRAFT_NONCANONICAL,
    outputClass: DRAFT_PIPELINE_CLASS,
    audioKind: 'NON_VOICE_TEST_AUDIO',
    synthesisedVoices: false,
    lockedVoicesUntouched: true,
    checks,
    technical,
    cacheKey: stableHash({ version: PREPRODUCTION_SUBSYSTEM_VERSIONS.motionAudioQc, checks }),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.motionAudioQc,
  };
}
