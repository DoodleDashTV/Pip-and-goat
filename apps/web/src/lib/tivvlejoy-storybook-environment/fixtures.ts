import { buildStorybookPlan } from './engine';

export const SYNTHETIC_STORYBOOK_INPUT = {
  sourceId: 'SRC_FIXTURE_VILLAGE',
  sourceSha: 'ab'.repeat(32),
  seed: 4170179,
  locationId: 'home_village' as const,
  lighting: 'TJ_DAY_ADVENTURE' as const,
  shotId: 'SH030',
  projectedFrameHeightPct: 22,
  hero: true,
  materialClass: 'wood' as const,
  materialConfidence: 0.92,
  palette: { approvedPct: 90, dominantUnapprovedPct: 4, outsideApprovedPct: 8 },
  sign: {
    template: 'TJ_SIGN_HANGING' as const,
    signClass: 'STORY_CRITICAL' as const,
    textCapHeightPx: 40,
    iconHeightPx: 72,
    contrast: 5.2,
    perspectiveDeg: 20,
    occlusion: 0,
  },
  dressing: { seed: 4170179, obstructionPct: 8, walkableWidthPct: 85, identicalCopies: 2 },
  visualScores: {
    focalReadability: 96,
    characterReadability: 95,
    composition916: 94,
    lighting: 93,
    palette: 92,
    dressing: 90,
    tierQuality: 91,
    signage: 90,
    kidReadability: 94,
  },
  provenance: {
    sourceId: 'SRC_FIXTURE_VILLAGE',
    licenseVerified: true,
    commercialUseAllowed: true,
    rawRedistributionAllowed: false,
    automationPermissionStatus: 'VERIFIED_RESTRICTED' as const,
    aiMlTrainingPermissionStatus: 'VERIFIED_RESTRICTED' as const,
    notes: 'Synthetic fixture only. No purchased bytes.',
  },
};

export function syntheticStorybookPlan() {
  return buildStorybookPlan(SYNTHETIC_STORYBOOK_INPUT);
}
