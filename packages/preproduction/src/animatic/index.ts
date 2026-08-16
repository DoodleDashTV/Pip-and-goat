/**
 * Animatic planner — 9:16 timing, holds, and transitions.
 *
 * This is a timing document for a local draft animatic. It never requests a
 * FINAL or THEATRICAL render. Proxy animatics stay PIPELINE_TEST.
 */
import { z } from 'zod';
import { stableHash } from '@doodle-dash/direction';
import { PlanIssueSchema, type PlanIssue } from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { isProxyCode, PROXY_WATERMARK } from '../proxy';
import type { StoryDraft } from '../story';
import type { StoryboardPlan } from '../storyboard';

export const AnimaticClipSchema = z.object({
  clipId: z.string(),
  panelId: z.string(),
  beatId: z.string(),
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().min(1),
  holdFrames: z.number().int().min(1),
  transition: z.enum(['CUT', 'DISSOLVE']),
  aspect: z.literal('9:16'),
  fps: z.literal(30),
  watermark: z.string().optional(),
});
export type AnimaticClip = z.infer<typeof AnimaticClipSchema>;

export const AnimaticPlanSchema = z.object({
  episodeId: z.string(),
  aspect: z.literal('9:16'),
  fps: z.literal(30),
  resolution: z.enum(['360x640', '540x960']),
  renderTier: z.literal('DRAFT'),
  outputClass: z.enum(['PIPELINE_TEST', 'STORY_DRAFT']),
  totalFrames: z.number().int().positive(),
  clips: z.array(AnimaticClipSchema).min(1),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.animatic),
});
export type AnimaticPlan = z.infer<typeof AnimaticPlanSchema>;

export function planAnimatic(
  draft: StoryDraft,
  storyboard: StoryboardPlan,
): { animatic: AnimaticPlan; issues: PlanIssue[] } {
  const issues: PlanIssue[] = [];
  const usesProxy = draft.occupants.some(isProxyCode);
  const fps = 30;
  let cursor = 0;
  const clips: AnimaticClip[] = [];

  for (const panel of storyboard.panels) {
    const beat = draft.beats.find((candidate) => candidate.beatId === panel.beatId);
    if (!beat) {
      issues.push({
        code: 'ANIMATIC_ORPHAN_PANEL',
        severity: 'ERROR',
        system: 'animatic',
        message: `Panel ${panel.panelId} has no matching story beat.`,
      });
      continue;
    }
    const holdFrames = Math.max(1, Math.round(beat.durationSeconds * fps));
    const startFrame = cursor;
    const endFrame = cursor + holdFrames;
    cursor = endFrame;
    clips.push(
      AnimaticClipSchema.parse({
        clipId: `clip_${panel.panelId}`,
        panelId: panel.panelId,
        beatId: beat.beatId,
        startFrame,
        endFrame,
        holdFrames,
        transition: beat.purpose === 'BUTTON' ? 'DISSOLVE' : 'CUT',
        aspect: '9:16',
        fps,
        watermark: usesProxy ? PROXY_WATERMARK : undefined,
      }),
    );
  }

  if (clips.length === 0) {
    issues.push({
      code: 'ANIMATIC_EMPTY',
      severity: 'ERROR',
      system: 'animatic',
      message: 'Animatic produced no clips.',
    });
  }

  const animatic = AnimaticPlanSchema.parse({
    episodeId: draft.episodeId,
    aspect: '9:16',
    fps,
    resolution: '360x640',
    renderTier: 'DRAFT',
    outputClass: usesProxy ? 'PIPELINE_TEST' : 'STORY_DRAFT',
    totalFrames: Math.max(1, cursor),
    clips,
    cacheKey: '',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.animatic,
  });
  animatic.cacheKey = stableHash({
    version: animatic.version,
    episodeId: animatic.episodeId,
    clips: animatic.clips,
    resolution: animatic.resolution,
  });

  return { animatic, issues: issues.map((issue) => PlanIssueSchema.parse(issue)) };
}
