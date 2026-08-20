import type { ContinuityIssueKind } from './types';

export interface ShotContinuitySnapshot {
  shotId: string;
  characterId: string;
  positionToken: string;
  facing: string;
  screenDirection: string;
  poseToken: string;
  propAttachment: string;
  gazeTarget: string;
  motionEntry: string;
  motionExit: string;
  locomotionPhase: string;
  hardCut: boolean;
}

export interface ContinuityIssue {
  kind: ContinuityIssueKind;
  fromShotId: string;
  toShotId: string;
  characterId: string;
  detail: string;
}

export function detectAnimationContinuity(
  previous: ShotContinuitySnapshot,
  next: ShotContinuitySnapshot,
): ContinuityIssue[] {
  if (previous.characterId !== next.characterId) return [];
  if (next.hardCut) return [];
  const issues: ContinuityIssue[] = [];
  const push = (kind: ContinuityIssueKind, detail: string) => {
    issues.push({
      kind,
      fromShotId: previous.shotId,
      toShotId: next.shotId,
      characterId: next.characterId,
      detail,
    });
  };
  if (previous.positionToken !== next.positionToken && previous.motionExit !== 'DEPART' && next.motionEntry !== 'ARRIVE') {
    push('POSITION_JUMP', `Position jumped from ${previous.positionToken} to ${next.positionToken}.`);
  }
  if (previous.facing !== next.facing && previous.motionExit !== 'TURN' && next.motionEntry !== 'TURN') {
    push('FACING_FLIP', `Facing flipped from ${previous.facing} to ${next.facing}.`);
  }
  if (previous.propAttachment !== next.propAttachment) {
    push('PROP_TELEPORT', `Prop attachment jumped from ${previous.propAttachment} to ${next.propAttachment}.`);
  }
  if (previous.gazeTarget !== next.gazeTarget && previous.motionExit !== 'LOOK_AWAY') {
    push('GAZE_DISCONTINUITY', `Gaze jumped from ${previous.gazeTarget} to ${next.gazeTarget}.`);
  }
  if (previous.motionExit === 'IN_MOTION' && next.motionEntry === 'STATIONARY') {
    push('MOTION_DISCONTINUITY', 'In-motion exit into stationary entry without settle.');
  }
  if (previous.locomotionPhase === 'CONTACT' && next.locomotionPhase === 'AIRBORNE' && next.motionEntry !== 'JUMP') {
    push('CONTACT_DISCONTINUITY', 'Contact phase became airborne without jump.');
  }
  return issues;
}
