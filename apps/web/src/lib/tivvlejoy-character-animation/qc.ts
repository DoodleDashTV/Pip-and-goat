import type { AdmissionInput } from './admission';
import { evaluateRigAdmission } from './admission';
import type { DialogueTimingPlan } from './dialogue';
import type { VisemePlan } from './viseme';
import type { BlinkPlan } from './blink';
import type { GazePlan } from './gaze';
import { detectContactDefects, type ContactDefect, type ContactPlan } from './contact';
import type { ContinuityIssue } from './continuity';
import { evaluatePerformanceFraming, type FramingCheckInput } from './framing';
import { ANIMATION_QC_SCHEMA, QC_CHECK_IDS, type QcCheckId, type QcState } from './types';

export type AccessoryPresence = {
  itemId: string;
  present: boolean;
  removable: boolean;
};

export interface AnimationQcInput {
  admission: AdmissionInput & { characterId: 'PIP' | 'GOAT' };
  characterIdExpected: 'PIP' | 'GOAT';
  timing: DialogueTimingPlan;
  viseme: VisemePlan;
  blink: BlinkPlan;
  gaze: GazePlan;
  contact: ContactPlan;
  contactDefects?: ContactDefect[];
  continuityIssues: ContinuityIssue[];
  accessories: AccessoryPresence[];
  framing: FramingCheckInput;
  animationFresh: boolean;
  gestureReadable: boolean;
  faceReadable: boolean;
}

export interface QcCheckResult {
  id: QcCheckId;
  status: QcState;
  hardBlocker: boolean;
  detail: string;
}

export interface AnimationQcReport {
  schema: typeof ANIMATION_QC_SCHEMA;
  checks: QcCheckResult[];
  hardBlockers: QcCheckResult[];
  warnings: QcCheckResult[];
  claimsVisualDeformationSuccess: false;
}

export function evaluateAnimationQc(input: AnimationQcInput): AnimationQcReport {
  const admission = evaluateRigAdmission(input.admission);
  const defects = input.contactDefects ?? detectContactDefects({});
  const framing = evaluatePerformanceFraming(input.framing);
  const missingAccessory = input.accessories.find((item) => !item.present && item.removable === false);
  const expectedVersion = input.admission.expectedRigVersion ?? input.admission.contract?.rigVersion ?? null;
  const presentedVersion = input.admission.contract?.rigVersion ?? null;

  const byId = (id: QcCheckId, status: QcState, hardBlocker: boolean, detail: string): QcCheckResult => ({
    id,
    status,
    hardBlocker,
    detail,
  });

  const checks: QcCheckResult[] = [
    byId('RIG_ADMITTED', admission.approvedForAnimation ? 'PASS' : 'FAIL', true, admission.humanLabel),
    byId(
      'RIG_VERSION_MATCH',
      expectedVersion && presentedVersion && expectedVersion === presentedVersion ? 'PASS' : expectedVersion ? 'FAIL' : 'NOT_EVALUATED',
      Boolean(expectedVersion),
      `Expected ${expectedVersion ?? 'unspecified'}, presented ${presentedVersion ?? 'none'}.`,
    ),
    byId(
      'CHARACTER_IDENTITY_MATCH',
      input.admission.characterId === input.characterIdExpected ? 'PASS' : 'FAIL',
      true,
      `Expected ${input.characterIdExpected}.`,
    ),
    byId(
      'DIALOGUE_TIMING_AVAILABLE',
      input.timing.fallbackTimingSource === 'TIMING_UNAVAILABLE' ? 'WARNING' : 'PASS',
      false,
      input.timing.fallbackTimingSource,
    ),
    byId(
      'VISEME_CONFIDENCE',
      input.viseme.confidence === 'HIGH' ? 'PASS' : 'WARNING',
      false,
      `${input.viseme.confidence}; pretendsAccurateLipSync=${input.viseme.pretendsAccurateLipSync}`,
    ),
    byId('BLINK_VALID', input.blink.events.length > 0 ? 'PASS' : 'WARNING', false, `${input.blink.events.length} blinks`),
    byId('GAZE_VALID', input.gaze.primary ? 'PASS' : 'FAIL', true, input.gaze.primary),
    byId(
      'POSE_CONTINUITY',
      input.continuityIssues.some((issue) => issue.kind === 'POSITION_JUMP' || issue.kind === 'FACING_FLIP' || issue.kind === 'MOTION_DISCONTINUITY')
        ? 'FAIL'
        : 'PASS',
      true,
      `${input.continuityIssues.length} continuity issues`,
    ),
    byId(
      'PROP_CONTINUITY',
      input.continuityIssues.some((issue) => issue.kind === 'PROP_TELEPORT') ? 'FAIL' : 'PASS',
      true,
      'Prop attachment continuity',
    ),
    byId('FOOT_CONTACT', defects.includes('DOUBLE_FLOATING_CONTACT') ? 'FAIL' : 'PASS', true, defects.join(',') || 'ok'),
    byId('FOOT_SLIDE', defects.includes('UNEXPLAINED_FOOT_SLIDE') ? 'FAIL' : 'PASS', true, 'Slide policy'),
    byId('GROUND_CONTACT', defects.includes('GROUND_PENETRATION') ? 'FAIL' : 'PASS', true, 'Ground policy'),
    byId('MOVEMENT_SPEED', defects.includes('IMPOSSIBLE_SPEED_CHANGE') ? 'FAIL' : 'PASS', true, 'Speed policy'),
    byId(
      'TURN_CONTINUITY',
      input.continuityIssues.some((issue) => issue.kind === 'FACING_FLIP') ? 'FAIL' : 'PASS',
      true,
      'Facing continuity',
    ),
    byId('GESTURE_READABILITY', input.gestureReadable ? 'PASS' : 'WARNING', false, 'Semantic gesture readability'),
    byId('FACE_READABILITY', input.faceReadable ? 'PASS' : 'WARNING', false, 'Semantic face readability'),
    byId('ACCESSORY_PRESENT', missingAccessory ? 'FAIL' : 'PASS', true, missingAccessory?.itemId ?? 'all present'),
    byId(
      'CAMERA_PERFORMANCE_VISIBILITY',
      framing.ok ? (framing.warnings.length ? 'WARNING' : 'PASS') : 'FAIL',
      !framing.ok,
      framing.blockers.join('; ') || framing.warnings.join('; ') || 'ok',
    ),
    byId('ANIMATION_DEPENDENCY_FRESH', input.animationFresh ? 'PASS' : 'FAIL', true, input.animationFresh ? 'fresh' : 'stale'),
  ];

  if (input.admission.contract?.evidenceClass === 'SYNTHETIC_PREVIEW') {
    for (const check of checks) {
      if (check.id === 'RIG_ADMITTED' && check.status === 'PASS') {
        check.status = 'FAIL';
        check.detail = 'Synthetic fixtures cannot claim visual deformation success or real admission.';
      }
    }
  }

  const present = new Set(checks.map((check) => check.id));
  for (const id of QC_CHECK_IDS) {
    if (!present.has(id)) {
      checks.push(byId(id, 'NOT_EVALUATED', false, 'not evaluated'));
    }
  }

  return {
    schema: ANIMATION_QC_SCHEMA,
    checks,
    hardBlockers: checks.filter((check) => check.hardBlocker && check.status === 'FAIL'),
    warnings: checks.filter((check) => check.status === 'WARNING'),
    claimsVisualDeformationSuccess: false,
  };
}
