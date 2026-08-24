import { sha256Canonical } from './hash';
import type { DepartmentCharacterId } from './types';

export type GoatIdentityRequirements = {
  characterId: 'CHAR_GOAT_001';
  displayName: 'Goat';
  creamBody: true;
  horns: true;
  pinkNose: true;
  collar: true;
  roundTagReadingGoat: true;
  warmPlayfulBoyCompanion: true;
  scaleRelativeToPip: 1.5;
  noUnintendedSilhouetteChange: true;
  noFacialAppealLoss: true;
  noVisibleTextureDegradationAt1080x1920: true;
};

export const GOAT_IDENTITY_REQUIREMENTS: GoatIdentityRequirements = {
  characterId: 'CHAR_GOAT_001',
  displayName: 'Goat',
  creamBody: true,
  horns: true,
  pinkNose: true,
  collar: true,
  roundTagReadingGoat: true,
  warmPlayfulBoyCompanion: true,
  scaleRelativeToPip: 1.5,
  noUnintendedSilhouetteChange: true,
  noFacialAppealLoss: true,
  noVisibleTextureDegradationAt1080x1920: true,
};

export type IdentityCheck = {
  code: string;
  required: true;
  observed: boolean | null;
  state: 'PASS' | 'BLOCKED_REAL_EXECUTION_REQUIRED' | 'FAIL';
  detail: string;
};

export type IdentityPreservationReport = {
  characterId: DepartmentCharacterId;
  requirements: GoatIdentityRequirements | { characterId: 'CHAR_PIP_001'; reserved: true };
  checks: readonly IdentityCheck[];
  state: 'BLOCKED_REAL_EXECUTION_REQUIRED' | 'FAIL' | 'READY_FOR_HUMAN_REVIEW';
  claimsVisualPass: false;
  reportSha256: string;
};

export function compileGoatIdentityReport(input: {
  realInspectionAvailable: boolean;
  observations?: Partial<Record<string, boolean>>;
}): IdentityPreservationReport {
  const checks: IdentityCheck[] = [
    ['cream_body', 'Cream body'],
    ['horns', 'Horns present'],
    ['pink_nose', 'Pink nose'],
    ['collar', 'Collar accessory'],
    ['round_tag', 'Round tag reading Goat'],
    ['companion_read', 'Warm playful boy companion read'],
    ['scale_1_5', 'Approximately 1.5× Pip scale'],
    ['silhouette', 'No unintended silhouette change'],
    ['facial_appeal', 'No loss of facial appeal'],
    ['texture_1080x1920', 'No texture degradation in 1080×1920 framing'],
  ].map(([code, label]) => {
    if (!input.realInspectionAvailable) {
      return {
        code,
        required: true as const,
        observed: null,
        state: 'BLOCKED_REAL_EXECUTION_REQUIRED' as const,
        detail: `${label} cannot be proven until Goat_FINN.zip is attached and inspected.`,
      };
    }
    const observed = input.observations?.[code];
    if (observed === true) {
      return { code, required: true as const, observed, state: 'PASS' as const, detail: `${label} observed.` };
    }
    return {
      code,
      required: true as const,
      observed: observed ?? false,
      state: 'FAIL' as const,
      detail: `${label} failed identity preservation.`,
    };
  });
  const failed = checks.some((item) => item.state === 'FAIL');
  const blocked = checks.some((item) => item.state === 'BLOCKED_REAL_EXECUTION_REQUIRED');
  const body = {
    characterId: 'CHAR_GOAT_001' as const,
    requirements: GOAT_IDENTITY_REQUIREMENTS,
    checks,
    state: (failed ? 'FAIL' : blocked ? 'BLOCKED_REAL_EXECUTION_REQUIRED' : 'READY_FOR_HUMAN_REVIEW') as IdentityPreservationReport['state'],
    claimsVisualPass: false as const,
  };
  return { ...body, reportSha256: sha256Canonical(body) };
}
