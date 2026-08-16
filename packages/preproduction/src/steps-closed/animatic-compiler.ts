/**
 * Step 13 — Animatic compiler (local proxy only).
 *
 * Converts storyboard panels into timed clips and a local FFmpeg draft mux.
 * Proxy colors, text cards, holds, silence, and synthetic non-voice tones only.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { planAnimatic, type AnimaticPlan } from '../animatic';
import { compileDraftMux, type AssemblyCommand } from '../assembly';
import { PROXY_WATERMARK } from '../proxy';
import type { StoryDraft } from '../story';
import type { StoryboardPlan } from '../storyboard';
import type { AudioPlan } from '../audio';
import { DRAFT_NONCANONICAL, DRAFT_PIPELINE_CLASS } from './story-brain';

export function compileClosedAnimatic(input: {
  draft: StoryDraft;
  storyboard: StoryboardPlan;
  audio: AudioPlan;
  outputPath: string;
}): {
  label: typeof DRAFT_NONCANONICAL;
  outputClass: typeof DRAFT_PIPELINE_CLASS;
  finishedCharacterAnimation: false;
  plan: AnimaticPlan;
  clips: Array<{
    clipId: string;
    panelId: string;
    beatId: string;
    startFrame: number;
    endFrame: number;
    holdFrames: number;
    watermark: string;
  }>;
  mux: AssemblyCommand;
  resolution: '360x640';
  aspect: '9:16';
  targetSeconds: number;
  audioKind: 'NON_VOICE_TEST_AUDIO';
  cacheKey: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.animaticCompiler;
} {
  if (input.outputPath.includes('production-library')) {
    throw new Error('Refuse: closed animatic compiler cannot write production-library/.');
  }
  const planned = planAnimatic(input.draft, input.storyboard);
  const mux = compileDraftMux({
    animatic: planned.animatic,
    audio: input.audio,
    outputPath: input.outputPath,
  });
  const clips = planned.animatic.clips.map((clip) => ({
    clipId: clip.clipId,
    panelId: clip.panelId,
    beatId: clip.beatId,
    startFrame: clip.startFrame,
    endFrame: clip.endFrame,
    holdFrames: clip.holdFrames,
    watermark: clip.watermark ?? PROXY_WATERMARK,
  }));
  return {
    label: DRAFT_NONCANONICAL,
    outputClass: DRAFT_PIPELINE_CLASS,
    finishedCharacterAnimation: false,
    plan: planned.animatic,
    clips,
    mux,
    resolution: '360x640',
    aspect: '9:16',
    targetSeconds: planned.animatic.totalFrames / planned.animatic.fps,
    audioKind: 'NON_VOICE_TEST_AUDIO',
    cacheKey: stableHash({
      version: PREPRODUCTION_SUBSYSTEM_VERSIONS.animaticCompiler,
      plan: planned.animatic.cacheKey,
      clips,
      outputPath: input.outputPath,
    }),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.animaticCompiler,
  };
}
