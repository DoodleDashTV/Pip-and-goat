/**
 * 9:16 shot-planning system.
 *
 * Extends the existing camera language without replacing Step 5. Plans
 * compositions, moves, and caption-safe framing for vertical delivery. Proxy
 * shots stay labeled and cannot be marked FINAL.
 */
import { z } from 'zod';
import { stableHash } from '@doodle-dash/direction';
import { PlanIssueSchema, type PlanIssue } from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { isProxyCode, PROXY_WATERMARK } from '../proxy';
import type { StoryDraft } from '../story';

export const VERTICAL_CAMERA_RULES = {
  aspect: '9:16' as const,
  minHeadroomRatio: 0.08,
  minFootRoomRatio: 0.06,
  captionSafeBottomRatio: 0.18,
  maxMoveSpeed: 0.35,
} as const;

export const ShotPlanItemSchema = z.object({
  shotId: z.string(),
  beatId: z.string(),
  composition: z.enum(['ESTABLISHING', 'TWO_SHOT', 'MEDIUM', 'CLOSE_UP', 'OVER_SHOULDER']),
  move: z.enum(['LOCKED', 'PAN', 'PUSH_IN', 'PULL_OUT']),
  lensMm: z.number().min(24).max(85),
  headroomRatio: z.number().min(0),
  footRoomRatio: z.number().min(0),
  captionSafe: z.boolean(),
  durationSeconds: z.number().positive(),
  occupants: z.array(z.string()).min(1),
  watermark: z.string().optional(),
  renderTier: z.literal('DRAFT'),
});
export type ShotPlanItem = z.infer<typeof ShotPlanItemSchema>;

export const ShotPlanSchema = z.object({
  episodeId: z.string(),
  aspect: z.literal('9:16'),
  fps: z.literal(30),
  deliveryResolution: z.literal('1080x1920'),
  planningResolution: z.literal('360x640'),
  shots: z.array(ShotPlanItemSchema).min(1),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.shotplan),
});
export type ShotPlan = z.infer<typeof ShotPlanSchema>;

const COMPOSITION_FOR_PURPOSE: Record<string, ShotPlanItem['composition']> = {
  HOOK: 'ESTABLISHING',
  SETUP: 'MEDIUM',
  DISCOVERY: 'TWO_SHOT',
  COMPLICATION: 'OVER_SHOULDER',
  TURN: 'TWO_SHOT',
  PAYOFF: 'MEDIUM',
  RESOLUTION: 'ESTABLISHING',
  BUTTON: 'CLOSE_UP',
};

const MOVE_FOR_PURPOSE: Record<string, ShotPlanItem['move']> = {
  HOOK: 'LOCKED',
  SETUP: 'PAN',
  DISCOVERY: 'PUSH_IN',
  COMPLICATION: 'LOCKED',
  TURN: 'PUSH_IN',
  PAYOFF: 'PULL_OUT',
  RESOLUTION: 'LOCKED',
  BUTTON: 'LOCKED',
};

export function planShots(draft: StoryDraft): { shotPlan: ShotPlan; issues: PlanIssue[] } {
  const issues: PlanIssue[] = [];
  const usesProxy = draft.occupants.some(isProxyCode);

  const shots = draft.beats.map((beat, index) => {
    const composition = COMPOSITION_FOR_PURPOSE[beat.purpose] ?? 'MEDIUM';
    const move = MOVE_FOR_PURPOSE[beat.purpose] ?? 'LOCKED';
    const lensMm = composition === 'CLOSE_UP' ? 55 : composition === 'ESTABLISHING' ? 28 : 35;
    const headroomRatio = composition === 'CLOSE_UP' ? 0.1 : 0.14;
    const footRoomRatio = composition === 'CLOSE_UP' ? 0.08 : 0.12;
    if (headroomRatio < VERTICAL_CAMERA_RULES.minHeadroomRatio) {
      issues.push({
        code: 'SHOT_HEADROOM_LOW',
        severity: 'ERROR',
        system: 'shotplan',
        message: `${beat.beatId} headroom ${headroomRatio} is below the 9:16 minimum.`,
      });
    }
    if (footRoomRatio < VERTICAL_CAMERA_RULES.minFootRoomRatio) {
      issues.push({
        code: 'SHOT_FOOTROOM_LOW',
        severity: 'ERROR',
        system: 'shotplan',
        message: `${beat.beatId} foot room ${footRoomRatio} is below the 9:16 minimum.`,
      });
    }
    return ShotPlanItemSchema.parse({
      shotId: `shot_${String(index + 1).padStart(3, '0')}`,
      beatId: beat.beatId,
      composition,
      move,
      lensMm,
      headroomRatio,
      footRoomRatio,
      captionSafe: true,
      durationSeconds: beat.durationSeconds,
      occupants: beat.occupants,
      watermark: usesProxy ? PROXY_WATERMARK : undefined,
      renderTier: 'DRAFT',
    });
  });

  const shotPlan = ShotPlanSchema.parse({
    episodeId: draft.episodeId,
    aspect: '9:16',
    fps: 30,
    deliveryResolution: '1080x1920',
    planningResolution: '360x640',
    shots,
    cacheKey: '',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.shotplan,
  });
  shotPlan.cacheKey = stableHash({
    version: shotPlan.version,
    episodeId: shotPlan.episodeId,
    shots: shotPlan.shots,
  });

  return { shotPlan, issues: issues.map((issue) => PlanIssueSchema.parse(issue)) };
}
