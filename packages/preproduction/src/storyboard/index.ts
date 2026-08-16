/**
 * Storyboard planner — one 9:16 panel per beat.
 *
 * Panels are descriptions and framing notes, not rendered frames. When the
 * occupants are proxies, every panel carries the proxy watermark. No panel may
 * claim to be a hero still or a theatrical binding sheet.
 */
import { z } from 'zod';
import { stableHash } from '@doodle-dash/direction';
import { PlanIssueSchema, type PlanIssue } from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { isProxyCode, PROXY_WATERMARK } from '../proxy';
import type { StoryDraft } from '../story';

export const StoryboardPanelSchema = z.object({
  panelId: z.string(),
  beatId: z.string(),
  aspect: z.literal('9:16'),
  framing: z.enum(['WIDE', 'MEDIUM', 'CLOSE_UP', 'TWO_SHOT']),
  action: z.string(),
  captionSafe: z.literal(true),
  watermark: z.string().optional(),
  proxyLabeled: z.boolean(),
  cameraIntent: z.string().optional(),
  holdHintSeconds: z.number().positive().optional(),
});
export type StoryboardPanel = z.infer<typeof StoryboardPanelSchema>;

export const StoryboardPlanSchema = z.object({
  episodeId: z.string(),
  title: z.string(),
  aspect: z.literal('9:16'),
  panels: z.array(StoryboardPanelSchema).min(1),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.storyboard),
});
export type StoryboardPlan = z.infer<typeof StoryboardPlanSchema>;

const FRAMING_FOR_PURPOSE: Record<string, StoryboardPanel['framing']> = {
  HOOK: 'WIDE',
  SETUP: 'MEDIUM',
  DISCOVERY: 'TWO_SHOT',
  COMPLICATION: 'MEDIUM',
  TURN: 'TWO_SHOT',
  PAYOFF: 'MEDIUM',
  RESOLUTION: 'WIDE',
  BUTTON: 'CLOSE_UP',
};

export function planStoryboard(draft: StoryDraft): {
  storyboard: StoryboardPlan;
  issues: PlanIssue[];
} {
  const issues: PlanIssue[] = [];
  const usesProxy = draft.occupants.some(isProxyCode);

  const panels = draft.beats.map((beat) => {
    const framing = FRAMING_FOR_PURPOSE[beat.purpose] ?? 'MEDIUM';
    if (framing === 'CLOSE_UP' && beat.occupants.length > 2) {
      issues.push({
        code: 'STORYBOARD_CLOSEUP_CROWD',
        severity: 'WARNING',
        system: 'storyboard',
        message: `${beat.beatId} is a close-up with ${beat.occupants.length} occupants.`,
      });
    }
    return StoryboardPanelSchema.parse({
      panelId: `panel_${beat.beatId}`,
      beatId: beat.beatId,
      aspect: '9:16',
      framing,
      action: beat.summary,
      captionSafe: true,
      watermark: usesProxy ? PROXY_WATERMARK : undefined,
      proxyLabeled: usesProxy,
      cameraIntent: `${framing} 9:16 caption-safe`,
      holdHintSeconds: beat.durationSeconds,
    });
  });

  if (usesProxy && panels.some((panel) => panel.watermark !== PROXY_WATERMARK)) {
    issues.push({
      code: 'STORYBOARD_PROXY_WATERMARK_MISSING',
      severity: 'ERROR',
      system: 'storyboard',
      message: 'Every proxy storyboard panel must carry the proxy watermark.',
    });
  }

  const storyboard = StoryboardPlanSchema.parse({
    episodeId: draft.episodeId,
    title: `${draft.title} — storyboard`,
    aspect: '9:16',
    panels,
    cacheKey: '',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.storyboard,
  });
  storyboard.cacheKey = stableHash({
    version: storyboard.version,
    episodeId: storyboard.episodeId,
    panels: storyboard.panels,
  });

  return { storyboard, issues: issues.map((issue) => PlanIssueSchema.parse(issue)) };
}
