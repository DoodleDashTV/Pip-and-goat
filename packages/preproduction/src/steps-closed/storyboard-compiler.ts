/**
 * Step 12 — Storyboard compiler (placeholders only).
 *
 * Extends the existing storyboard planner with closed-gate compiler fields.
 * Does not import or bind Pip or Goat assets.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { planStoryboard, type StoryboardPlan } from '../storyboard';
import { PROXY_WATERMARK, isProxyCode } from '../proxy';
import type { StoryDraft } from '../story';
import { DRAFT_NONCANONICAL, DRAFT_PIPELINE_CLASS } from './story-brain';

const ANGLE_FOR_PURPOSE: Record<string, string> = {
  HOOK: 'HIGH',
  SETUP: 'EYE',
  DISCOVERY: 'EYE',
  COMPLICATION: 'OVER_SHOULDER',
  TURN: 'EYE',
  PAYOFF: 'EYE',
  RESOLUTION: 'HIGH',
  BUTTON: 'EYE',
};

const MOVE_FOR_PURPOSE: Record<string, string> = {
  HOOK: 'LOCKED',
  SETUP: 'PAN',
  DISCOVERY: 'PUSH_IN',
  COMPLICATION: 'LOCKED',
  TURN: 'PUSH_IN',
  PAYOFF: 'PULL_OUT',
  RESOLUTION: 'LOCKED',
  BUTTON: 'LOCKED',
};

export function compileClosedStoryboard(draft: StoryDraft): {
  label: typeof DRAFT_NONCANONICAL;
  outputClass: typeof DRAFT_PIPELINE_CLASS;
  bindsPipGoatAssets: false;
  plan: StoryboardPlan;
  panels: Array<{
    panelId: string;
    beatId: string;
    framing: string;
    cameraAngle: string;
    cameraMovementIntent: string;
    subjectBlocking: string;
    action: string;
    emotionIntent: string;
    environment: string;
    propState: string[];
    transition: 'CUT' | 'DISSOLVE';
    durationSeconds: number;
    safetyNotes: string;
    watermark: string;
  }>;
  cacheKey: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.storyboardCompiler;
} {
  const planned = planStoryboard(draft);
  const panels = planned.storyboard.panels.map((panel) => {
    const beat = draft.beats.find((candidate) => candidate.beatId === panel.beatId);
    const purpose = beat?.purpose ?? 'SETUP';
    return {
      panelId: panel.panelId,
      beatId: panel.beatId,
      framing: panel.framing,
      cameraAngle: ANGLE_FOR_PURPOSE[purpose] ?? 'EYE',
      cameraMovementIntent: MOVE_FOR_PURPOSE[purpose] ?? 'LOCKED',
      subjectBlocking: (beat?.occupants ?? []).filter(isProxyCode).join(' + ') || 'placeholder',
      action: panel.action,
      emotionIntent: beat?.emotion ?? 'curious',
      environment: beat?.locationId ?? 'env_meadow_edge_v1',
      propState: [...(beat?.requiredProps ?? [])],
      transition: purpose === 'BUTTON' ? ('DISSOLVE' as const) : ('CUT' as const),
      durationSeconds: beat?.durationSeconds ?? panel.holdHintSeconds ?? 3,
      safetyNotes: 'Caption-safe 9:16. Placeholder occupants only. No founding-character assets.',
      watermark: panel.watermark ?? PROXY_WATERMARK,
    };
  });
  return {
    label: DRAFT_NONCANONICAL,
    outputClass: DRAFT_PIPELINE_CLASS,
    bindsPipGoatAssets: false,
    plan: planned.storyboard,
    panels,
    cacheKey: stableHash({
      version: PREPRODUCTION_SUBSYSTEM_VERSIONS.storyboardCompiler,
      plan: planned.storyboard.cacheKey,
      panels,
    }),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.storyboardCompiler,
  };
}
