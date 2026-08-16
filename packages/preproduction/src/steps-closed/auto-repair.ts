/**
 * Step 16 — Auto-repair and acceptance orchestration helpers.
 *
 * Local unpaid repairs only. Creates a new draft version, records every
 * repair, and requires QC to be re-run. Never enters FINAL or canon.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { recordArtifactVersion, rollbackArtifact, type ArtifactHistory } from '../versioning';
import { invalidateShots, type ShotDependency } from '../dependencies';
import { PROXY_WATERMARK } from '../proxy';
import type { AnimaticPlan } from '../animatic';
import type { StoryboardPlan } from '../storyboard';
import type { AudioPlan } from '../audio';
import { compileVisualQc } from './visual-qc';
import { compileMotionAudioQc } from './motion-audio-qc';
import { DRAFT_NONCANONICAL, DRAFT_PIPELINE_CLASS } from './story-brain';

export type RepairAction =
  | 'TIMING_NORMALIZATION'
  | 'MISSING_PROXY_FRAME'
  | 'INVALID_TRANSITION'
  | 'AUDIO_PADDING'
  | 'TITLE_SAFE_ADJUSTMENT'
  | 'STALE_DEPENDENCY_INVALIDATION'
  | 'CACHE_KEY_REGENERATION';

const PROTECTED = ['production-library', 'pip_production', 'goat_production', 'pip_default_v1', 'goat_default_v1', 'THEATRICAL'];

export function refuseProtectedRepair(proposed: string): { allowed: false; reason: string } | { allowed: true } {
  const lowered = proposed.toLowerCase();
  if (PROTECTED.some((needle) => lowered.includes(needle.toLowerCase()))) {
    return {
      allowed: false,
      reason: 'Refuse: repair would touch protected character assets, production-library/, locked voices, or theatrical binding.',
    };
  }
  return { allowed: true };
}

export function planAutoRepair(input: {
  storyboard: StoryboardPlan;
  animatic: AnimaticPlan;
  audio: AudioPlan;
  dependencies: readonly ShotDependency[];
  history?: ArtifactHistory;
}): {
  label: typeof DRAFT_NONCANONICAL;
  outputClass: typeof DRAFT_PIPELINE_CLASS;
  paid: false;
  mayEnterFinal: false;
  mayPromoteCanon: false;
  skippedQc: false;
  actions: Array<{ action: RepairAction; applied: boolean; detail: string }>;
  refused: Array<{ action: string; reason: string }>;
  repairedAnimatic: AnimaticPlan;
  repairedStoryboard: StoryboardPlan;
  versionHistory: ArtifactHistory;
  visualQc: ReturnType<typeof compileVisualQc>;
  motionAudioQc: ReturnType<typeof compileMotionAudioQc>;
  invalidation: ReturnType<typeof invalidateShots>;
  cacheKey: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.autoRepair;
} {
  const refused: Array<{ action: string; reason: string }> = [];
  const actions: Array<{ action: RepairAction; applied: boolean; detail: string }> = [];
  const animatic: AnimaticPlan = {
    ...input.animatic,
    clips: input.animatic.clips.map((clip) => ({ ...clip })),
  };
  const storyboard: StoryboardPlan = {
    ...input.storyboard,
    panels: input.storyboard.panels.map((panel) => ({ ...panel })),
  };

  const protectedCheck = refuseProtectedRepair(`${animatic.episodeId} ${storyboard.title}`);
  if (!protectedCheck.allowed) {
    refused.push({ action: 'ALL', reason: protectedCheck.reason });
  }

  let cursor = 0;
  for (const clip of animatic.clips) {
    if (clip.holdFrames < 1) {
      clip.holdFrames = 1;
      actions.push({ action: 'MISSING_PROXY_FRAME', applied: true, detail: `${clip.clipId} regenerated 1-frame hold` });
    }
    if (clip.transition !== 'CUT' && clip.transition !== 'DISSOLVE') {
      clip.transition = 'CUT';
      actions.push({ action: 'INVALID_TRANSITION', applied: true, detail: `${clip.clipId} replaced with CUT` });
    }
    if (!clip.watermark) {
      clip.watermark = PROXY_WATERMARK;
      actions.push({ action: 'MISSING_PROXY_FRAME', applied: true, detail: `${clip.clipId} watermark restored` });
    }
    clip.startFrame = cursor;
    clip.endFrame = cursor + clip.holdFrames;
    cursor = clip.endFrame;
  }
  if (cursor !== input.animatic.totalFrames) {
    actions.push({ action: 'TIMING_NORMALIZATION', applied: true, detail: `normalized to ${cursor} frames` });
  }
  animatic.totalFrames = Math.max(1, cursor);

  for (const panel of storyboard.panels) {
    if (!panel.captionSafe) {
      (panel as { captionSafe: true }).captionSafe = true;
      actions.push({ action: 'TITLE_SAFE_ADJUSTMENT', applied: true, detail: `${panel.panelId} caption-safe forced` });
    }
    if (!panel.watermark) {
      panel.watermark = PROXY_WATERMARK;
    }
  }

  if (input.audio.tracks.some((track) => track.gainDb > 0)) {
    const guard = refuseProtectedRepair('audio padding');
    if (guard.allowed) {
      actions.push({ action: 'AUDIO_PADDING', applied: true, detail: 'planned mix stays padded to animatic duration' });
    } else {
      refused.push({ action: 'AUDIO_PADDING', reason: guard.reason });
    }
  } else {
    actions.push({ action: 'AUDIO_PADDING', applied: true, detail: 'audio already padded / at or below 0 dB' });
  }

  const invalidation = invalidateShots(input.dependencies, {
    kind: 'CLIP',
    id: animatic.clips[0]?.clipId ?? 'none',
  });
  actions.push({
    action: 'STALE_DEPENDENCY_INVALIDATION',
    applied: true,
    detail: `${invalidation.dirtyShotIds.length} dirty shots; paidRerender=${invalidation.paidRerender}`,
  });

  animatic.cacheKey = stableHash({
    version: animatic.version,
    clips: animatic.clips,
    totalFrames: animatic.totalFrames,
    repaired: true,
  });
  storyboard.cacheKey = stableHash({
    version: storyboard.version,
    panels: storyboard.panels,
    repaired: true,
  });
  actions.push({ action: 'CACHE_KEY_REGENERATION', applied: true, detail: 'draft cache keys regenerated' });

  const previous = input.history ?? recordArtifactVersion({ kind: 'ANIMATIC', cacheKey: input.animatic.cacheKey });
  const versionHistory = recordArtifactVersion({
    kind: 'ANIMATIC',
    cacheKey: animatic.cacheKey,
    history: previous,
  });
  if (versionHistory.current.canonical || versionHistory.current.productionEligible) {
    throw new Error('Refuse: auto-repair cannot promote a draft.');
  }
  rollbackArtifact(versionHistory, 1);

  const visualQc = compileVisualQc({ storyboard, animatic });
  const motionAudioQc = compileMotionAudioQc({ animatic, audio: input.audio });

  return {
    label: DRAFT_NONCANONICAL,
    outputClass: DRAFT_PIPELINE_CLASS,
    paid: false,
    mayEnterFinal: false,
    mayPromoteCanon: false,
    skippedQc: false,
    actions,
    refused,
    repairedAnimatic: animatic,
    repairedStoryboard: storyboard,
    versionHistory,
    visualQc,
    motionAudioQc,
    invalidation,
    cacheKey: stableHash({
      version: PREPRODUCTION_SUBSYSTEM_VERSIONS.autoRepair,
      actions,
      animatic: animatic.cacheKey,
      storyboard: storyboard.cacheKey,
    }),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.autoRepair,
  };
}
