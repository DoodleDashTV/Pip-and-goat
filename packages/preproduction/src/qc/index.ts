/**
 * Visual, motion and audio QC for proxy-safe drafts.
 *
 * Analytic checks against the planned documents. A PASS here is not artistic
 * approval and is not a FINAL_1080P acceptance. Proxy work must keep its
 * watermark and must fail if anyone labeled it final.
 */
import { z } from 'zod';
import { stableHash } from '@doodle-dash/direction';
import { PlanIssueSchema, type PlanIssue } from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { isProxyCode, PROXY_WATERMARK } from '../proxy';
import type { StoryDraft } from '../story';
import type { StoryboardPlan } from '../storyboard';
import type { AnimaticPlan } from '../animatic';
import type { ShotPlan } from '../shotplan';
import type { AudioPlan } from '../audio';

export const QcCheckSchema = z.object({
  item: z.enum([
    'ASPECT_9_16',
    'PROXY_WATERMARK',
    'NO_FINAL_CLAIM',
    'MOTION_PLANNED',
    'AUDIO_LOCKED_VOICES',
    'CAPTION_SAFE',
    'DRAFT_TIER_ONLY',
  ]),
  status: z.enum(['PASS', 'FAIL', 'NOT_APPLICABLE']),
  detail: z.string(),
});
export type QcCheck = z.infer<typeof QcCheckSchema>;

export const QcReportSchema = z.object({
  episodeId: z.string(),
  technical: z.enum(['PASS', 'FAIL']),
  artistic: z.literal('NOT_RENDERED'),
  checks: z.array(QcCheckSchema),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.qc),
});
export type QcReport = z.infer<typeof QcReportSchema>;

export function planQc(input: {
  draft: StoryDraft;
  storyboard: StoryboardPlan;
  animatic: AnimaticPlan;
  shotPlan: ShotPlan;
  audio: AudioPlan;
}): { qc: QcReport; issues: PlanIssue[] } {
  const issues: PlanIssue[] = [];
  const usesProxy = input.draft.occupants.some(isProxyCode);
  const checks: QcCheck[] = [];

  const aspectOk =
    input.storyboard.aspect === '9:16' &&
    input.animatic.aspect === '9:16' &&
    input.shotPlan.aspect === '9:16';
  checks.push({
    item: 'ASPECT_9_16',
    status: aspectOk ? 'PASS' : 'FAIL',
    detail: aspectOk ? 'Storyboard, animatic and shots are 9:16.' : 'A planned document left 9:16.',
  });

  if (usesProxy) {
    const watermarked =
      input.storyboard.panels.every((panel) => panel.watermark === PROXY_WATERMARK) &&
      input.animatic.clips.every((clip) => clip.watermark === PROXY_WATERMARK) &&
      input.shotPlan.shots.every((shot) => shot.watermark === PROXY_WATERMARK);
    checks.push({
      item: 'PROXY_WATERMARK',
      status: watermarked ? 'PASS' : 'FAIL',
      detail: watermarked
        ? 'Every proxy panel, clip and shot carries the watermark.'
        : 'A proxy document is missing the required watermark.',
    });
  } else {
    checks.push({
      item: 'PROXY_WATERMARK',
      status: 'NOT_APPLICABLE',
      detail: 'Canonical story roles; no proxy watermark required.',
    });
  }

  const claimsFinal =
    input.animatic.renderTier !== 'DRAFT' ||
    input.shotPlan.shots.some((shot) => shot.renderTier !== 'DRAFT');
  checks.push({
    item: 'NO_FINAL_CLAIM',
    status: claimsFinal ? 'FAIL' : 'PASS',
    detail: claimsFinal
      ? 'A pre-production document claimed a non-DRAFT render tier.'
      : 'No pre-production document claims FINAL.',
  });

  checks.push({
    item: 'MOTION_PLANNED',
    status: input.shotPlan.shots.length === input.draft.beats.length ? 'PASS' : 'FAIL',
    detail: `${input.shotPlan.shots.length} shots for ${input.draft.beats.length} beats.`,
  });

  const lockedVoiceSafe = input.audio.lockedVoicesUntouched && input.audio.tracks.every((track) => {
    if (!track.occupant) return true;
    if (isProxyCode(track.occupant)) return track.voiceId === 'proxy_voice_placeholder_v1';
    return track.voiceId === 'pip_default_v1' || track.voiceId === 'goat_default_v1';
  });
  checks.push({
    item: 'AUDIO_LOCKED_VOICES',
    status: lockedVoiceSafe ? 'PASS' : 'FAIL',
    detail: lockedVoiceSafe
      ? 'Locked voices were not cloned or reassigned.'
      : 'A voice binding violates the lock or proxy placeholder rule.',
  });

  checks.push({
    item: 'CAPTION_SAFE',
    status: input.shotPlan.shots.every((shot) => shot.captionSafe) ? 'PASS' : 'FAIL',
    detail: '9:16 caption-safe region reserved on every shot.',
  });

  checks.push({
    item: 'DRAFT_TIER_ONLY',
    status: input.animatic.renderTier === 'DRAFT' ? 'PASS' : 'FAIL',
    detail: `Animatic render tier is ${input.animatic.renderTier}.`,
  });

  for (const check of checks) {
    if (check.status === 'FAIL') {
      issues.push({
        code: `QC_${check.item}`,
        severity: 'ERROR',
        system: 'qc',
        message: check.detail,
      });
    }
  }

  const qc = QcReportSchema.parse({
    episodeId: input.draft.episodeId,
    technical: issues.some((issue) => issue.severity === 'ERROR') ? 'FAIL' : 'PASS',
    artistic: 'NOT_RENDERED',
    checks,
    cacheKey: '',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.qc,
  });
  qc.cacheKey = stableHash({ version: qc.version, checks: qc.checks });

  return { qc, issues: issues.map((issue) => PlanIssueSchema.parse(issue)) };
}
