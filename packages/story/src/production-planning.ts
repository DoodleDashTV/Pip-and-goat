/**
 * Story Brain continuation — season, animatic, shot-planning QC.
 *
 * These planners stay character-geometry independent. They can organize a
 * season and block FINAL character-dependent framing while Pip is unapproved.
 */
import { z } from 'zod';

const KNOWN_CAMERA_PRESETS = ['establishingWide', 'storyMedium', 'wonderDolly', 'heroCloseUp'] as const;
const KNOWN_LIGHTING_PRESETS = ['sunnyPlayroom', 'twilightWonder', 'cozyLesson'] as const;

export const AnimaticBeatSchema = z.object({
  beatId: z.string().min(1),
  durationSeconds: z.number().positive(),
  summary: z.string().min(1),
  locationId: z.string().min(1),
  characterCodes: z.array(z.string()).default([]),
  cameraPreset: z.string().default('storyMedium'),
  lightingPreset: z.string().default('sunnyPlayroom'),
  usesApprovedCharacterGeometry: z.boolean().default(false),
  finalCharacterFraming: z.boolean().default(false),
});
export type AnimaticBeat = z.infer<typeof AnimaticBeatSchema>;

export const AnimaticPlanSchema = z.object({
  episodeTitle: z.string().min(1),
  targetSeconds: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  publicCanon: z.boolean().default(false),
  paidResources: z.literal(false).default(false),
  beats: z.array(AnimaticBeatSchema).min(1),
});
export type AnimaticPlan = z.infer<typeof AnimaticPlanSchema>;

export type ShotPlanningIssue = {
  code: string;
  severity: 'warning' | 'error';
  message: string;
};

export function planAnimatic(raw: z.input<typeof AnimaticPlanSchema>) {
  const plan = AnimaticPlanSchema.parse(raw);
  const duration = plan.beats.reduce((sum, beat) => sum + beat.durationSeconds, 0);
  return {
    ...plan,
    plannedSeconds: duration,
    withinTarget: Math.abs(duration - plan.targetSeconds) <= 2,
    productionReady: false,
  };
}

export function evaluateShotPlanningQc(beat: z.input<typeof AnimaticBeatSchema>): ShotPlanningIssue[] {
  const data = AnimaticBeatSchema.parse(beat);
  const issues: ShotPlanningIssue[] = [];
  if (data.finalCharacterFraming && !data.usesApprovedCharacterGeometry) {
    issues.push({
      code: 'FINAL_CHARACTER_FRAMING_BLOCKED',
      severity: 'error',
      message:
        'Final character-dependent camera framing is blocked until Justin approves a Pip replacement.',
    });
  }

  if (data.characterCodes.includes('CHAR_PIP_001') && data.finalCharacterFraming) {
    issues.push({
      code: 'PIP_UNAPPROVED_FOR_FINAL',
      severity: 'error',
      message: 'Pip is a replacement-pending candidate. Proxy or prototype framing only.',
    });
  }

  if (!(KNOWN_CAMERA_PRESETS as readonly string[]).includes(data.cameraPreset)) {
    issues.push({
      code: 'UNKNOWN_CAMERA_PRESET',
      severity: 'error',
      message: `Unknown camera preset ${data.cameraPreset}.`,
    });
  }
  if (!(KNOWN_LIGHTING_PRESETS as readonly string[]).includes(data.lightingPreset)) {
    issues.push({
      code: 'UNKNOWN_LIGHTING_PRESET',
      severity: 'error',
      message: `Unknown lighting preset ${data.lightingPreset}.`,
    });
  }

  return issues;
}

export function continuityBlockersForUnapprovedPip(input: {
  mentionsPip?: boolean;
  claimsProductionReady?: boolean;
  claimsTheatricalBound?: boolean;
}) {
  const blockers: string[] = [];
  if (input.claimsProductionReady) {
    blockers.push('Cannot claim production-ready while Pip replacement is pending.');
  }
  if (input.claimsTheatricalBound) {
    blockers.push('Cannot claim theatrical binding while the theatrical gate is closed.');
  }
  if (input.mentionsPip) {
    blockers.push('Pip identity may be planned; Pip geometry may not be locked.');
  }
  return blockers;
}

export const SEASON_ORGANIZATION = {
  internalTestSeasonNumber: 99,
  publicSeasonOneApproved: false,
  firstPublicEpisodeBlocked: true,
  reason: 'Character-dependent production waits on an approved Pip replacement.',
} as const;
