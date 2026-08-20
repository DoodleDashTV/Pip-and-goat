import { sha256Canonical } from './hash';
import {
  EDIT_RHYTHM_SCHEMA,
  EDITORIAL_SCHEMA,
  EDITORIAL_TRACKS,
  PACE_PROFILES,
  TRANSITIONS,
  type EditorialTrackKind,
  type PaceProfile,
  type TransitionType,
} from './types';
import type { StoryBeat } from './beats';
import type { ShotIntent } from './types';

export type EditorialClip = {
  clipId: string;
  track: EditorialTrackKind;
  shotId?: string;
  inFrame: number;
  outFrame: number;
  durationFrames: number;
  handlesBefore: number;
  handlesAfter: number;
  ref: string;
};

export type EditorialTransition = {
  transitionId: string;
  type: TransitionType;
  atFrame: number;
  reason: string;
};

export type EditorialMarker = {
  markerId: string;
  frame: number;
  label: string;
};

export type EditorialTrack = {
  kind: EditorialTrackKind;
  clips: EditorialClip[];
};

export type EditorialTimeline = {
  schemaVersion: typeof EDITORIAL_SCHEMA;
  episodeId: string;
  fps: number;
  tracks: EditorialTrack[];
  transitions: EditorialTransition[];
  markers: EditorialMarker[];
  totalFrames: number;
  timelineSha256: string;
};

export type ShotTiming = {
  shotId: string;
  inFrame: number;
  outFrame: number;
  durationFrames: number;
  handlesBefore: number;
  handlesAfter: number;
  minimumReadableDuration: number;
  maximumHoldDuration: number;
  dialogueConstraint: number | null;
  actionConstraint: number | null;
  reactionConstraint: number | null;
  transitionConstraint: number | null;
};

export const DEFAULT_PACE_THRESHOLDS: Record<PaceProfile, { minCut: number; maxHold: number; minReaction: number; minInsert: number; minEstablish: number; minButton: number }> = {
  CALM_DISCOVERY: { minCut: 48, maxHold: 300, minReaction: 36, minInsert: 30, minEstablish: 90, minButton: 48 },
  NORMAL_ADVENTURE: { minCut: 36, maxHold: 240, minReaction: 30, minInsert: 24, minEstablish: 75, minButton: 36 },
  FAST_COMEDY: { minCut: 20, maxHold: 150, minReaction: 24, minInsert: 20, minEstablish: 48, minButton: 30 },
  TENSION_BUILD: { minCut: 24, maxHold: 210, minReaction: 28, minInsert: 24, minEstablish: 60, minButton: 36 },
  MAGICAL_WONDER: { minCut: 40, maxHold: 270, minReaction: 36, minInsert: 30, minEstablish: 90, minButton: 48 },
  ACTION_BURST: { minCut: 16, maxHold: 120, minReaction: 20, minInsert: 16, minEstablish: 36, minButton: 24 },
  EMOTIONAL_HOLD: { minCut: 48, maxHold: 360, minReaction: 48, minInsert: 30, minEstablish: 90, minButton: 60 },
};

export function durationForShot(input: {
  beat: StoryBeat;
  intent: ShotIntent;
  pace: PaceProfile;
  dialogueFrames?: number | null;
  fps?: number;
}): ShotTiming {
  const fps = input.fps ?? 30;
  const thresholds = DEFAULT_PACE_THRESHOLDS[input.pace];
  let duration = input.beat.durationTarget;
  if (input.intent === 'ESTABLISHING') duration = Math.max(duration, thresholds.minEstablish);
  if (input.intent === 'REACTION') duration = Math.max(duration, thresholds.minReaction);
  if (input.intent === 'INSERT' || input.intent === 'PROP_INSERT') duration = Math.max(duration, thresholds.minInsert);
  if (input.beat.beatType === 'BUTTON') duration = Math.max(duration, thresholds.minButton);
  if (input.dialogueFrames) duration = Math.max(duration, input.dialogueFrames + 12);
  return {
    shotId: '',
    inFrame: 0,
    outFrame: duration,
    durationFrames: duration,
    handlesBefore: 8,
    handlesAfter: 8,
    minimumReadableDuration: thresholds.minCut,
    maximumHoldDuration: thresholds.maxHold,
    dialogueConstraint: input.dialogueFrames ?? null,
    actionConstraint: input.intent === 'FOLLOW' ? Math.round(fps * 2.5) : null,
    reactionConstraint: input.intent === 'REACTION' ? thresholds.minReaction : null,
    transitionConstraint: 6,
  };
}

export function chooseTransition(input: {
  fromIntent: ShotIntent;
  toIntent: ShotIntent;
  locationChanged: boolean;
  fromBeat?: string;
  dissolveBudgetUsed?: number;
}): EditorialTransition & { type: TransitionType } {
  let type: TransitionType = 'HARD_CUT';
  let reason = 'Default picture cut.';
  if (input.fromIntent === 'REACTION' || input.toIntent === 'REACTION') {
    type = 'REACTION_CUT';
    reason = 'Cut on the reaction.';
  } else if (input.locationChanged) {
    type = 'LOCATION_CUT';
    reason = 'Geography changed.';
  } else if (input.fromIntent === 'FOLLOW' || input.toIntent === 'FOLLOW') {
    type = 'ACTION_CUT';
    reason = 'Cut on locomotion.';
  } else if (input.fromIntent === 'PROP_INSERT' && input.toIntent === 'CLOSE_UP') {
    type = 'MATCH_CUT';
    reason = 'Match the looked-at object to the face.';
  } else if (input.fromBeat === 'BUTTON' || input.toIntent === 'LOCATION_TRANSITION') {
    type = (input.dissolveBudgetUsed ?? 0) >= 1 ? 'HARD_CUT' : 'FADE_OUT';
    reason = type === 'FADE_OUT' ? 'Episode button may fade.' : 'Dissolve budget already used.';
  }
  return { transitionId: `${input.fromIntent}_${input.toIntent}`, type, atFrame: 0, reason };
}

export function buildEditorialTimeline(input: {
  episodeId: string;
  fps?: number;
  shots: Array<{ shotId: string; durationFrames: number; intent: ShotIntent; locationId: string; dialogueRef?: string | null; sfxCount?: number }>;
}): EditorialTimeline {
  const fps = input.fps ?? 30;
  const video: EditorialClip[] = [];
  const dialogue: EditorialClip[] = [];
  const markers: EditorialMarker[] = [];
  const transitions: EditorialTransition[] = [];
  let cursor = 0;
  let dissolveUsed = 0;
  input.shots.forEach((shot, index) => {
    const inFrame = cursor;
    const outFrame = cursor + shot.durationFrames;
    video.push({
      clipId: `${shot.shotId}_VIDEO`,
      track: 'VIDEO',
      shotId: shot.shotId,
      inFrame,
      outFrame,
      durationFrames: shot.durationFrames,
      handlesBefore: 8,
      handlesAfter: 8,
      ref: shot.shotId,
    });
    if (shot.dialogueRef) {
      dialogue.push({
        clipId: `${shot.shotId}_DL`,
        track: 'DIALOGUE',
        shotId: shot.shotId,
        inFrame: inFrame + 6,
        outFrame: outFrame - 6,
        durationFrames: shot.durationFrames - 12,
        handlesBefore: 0,
        handlesAfter: 0,
        ref: shot.dialogueRef,
      });
    }
    markers.push({ markerId: `${shot.shotId}_MARK`, frame: inFrame, label: shot.shotId });
    if (index > 0) {
      const prev = input.shots[index - 1]!;
      const transition = chooseTransition({
        fromIntent: prev.intent,
        toIntent: shot.intent,
        locationChanged: prev.locationId !== shot.locationId,
        dissolveBudgetUsed: dissolveUsed,
      });
      if (transition.type === 'DISSOLVE' || transition.type === 'FADE_OUT' || transition.type === 'FADE_IN') dissolveUsed += 1;
      transitions.push({ ...transition, transitionId: `${prev.shotId}_${shot.shotId}`, atFrame: inFrame });
    }
    cursor = outFrame;
  });
  const tracks: EditorialTrack[] = EDITORIAL_TRACKS.map((kind) => ({
    kind,
    clips: kind === 'VIDEO' ? video : kind === 'DIALOGUE' ? dialogue : [],
  }));
  const body = {
    schemaVersion: EDITORIAL_SCHEMA,
    episodeId: input.episodeId,
    fps,
    tracks,
    transitions,
    markers,
    totalFrames: cursor,
  };
  return { ...body, timelineSha256: sha256Canonical(body) };
}

export type EditRhythmFinding = {
  code:
    | 'TOO_MANY_RAPID_CUTS'
    | 'TOO_MANY_LONG_HOLDS'
    | 'REACTION_CUT_TOO_SHORT'
    | 'PROP_INSERT_TOO_SHORT'
    | 'ESTABLISHING_SHOT_TOO_SHORT'
    | 'DIALOGUE_CLIPPED'
    | 'ACTION_CUT_MID_CONTACT'
    | 'ENDING_BUTTON_TOO_SHORT';
  shotId?: string;
};

export function evaluateEditRhythm(input: {
  pace: PaceProfile;
  shots: Array<{ shotId: string; durationFrames: number; intent: ShotIntent; beatType?: string; dialogueFrames?: number | null; actionCutMidContact?: boolean }>;
}): { schemaVersion: typeof EDIT_RHYTHM_SCHEMA; findings: EditRhythmFinding[]; passed: boolean } {
  const thresholds = DEFAULT_PACE_THRESHOLDS[input.pace];
  const findings: EditRhythmFinding[] = [];
  const rapid = input.shots.filter((shot) => shot.durationFrames < thresholds.minCut).length;
  const holds = input.shots.filter((shot) => shot.durationFrames > thresholds.maxHold).length;
  if (rapid >= Math.max(3, Math.ceil(input.shots.length * 0.45))) findings.push({ code: 'TOO_MANY_RAPID_CUTS' });
  if (holds >= Math.max(3, Math.ceil(input.shots.length * 0.4))) findings.push({ code: 'TOO_MANY_LONG_HOLDS' });
  for (const shot of input.shots) {
    if (shot.intent === 'REACTION' && shot.durationFrames < thresholds.minReaction) findings.push({ code: 'REACTION_CUT_TOO_SHORT', shotId: shot.shotId });
    if ((shot.intent === 'INSERT' || shot.intent === 'PROP_INSERT') && shot.durationFrames < thresholds.minInsert) findings.push({ code: 'PROP_INSERT_TOO_SHORT', shotId: shot.shotId });
    if (shot.intent === 'ESTABLISHING' && shot.durationFrames < thresholds.minEstablish) findings.push({ code: 'ESTABLISHING_SHOT_TOO_SHORT', shotId: shot.shotId });
    if (shot.dialogueFrames && shot.durationFrames < shot.dialogueFrames) findings.push({ code: 'DIALOGUE_CLIPPED', shotId: shot.shotId });
    if (shot.actionCutMidContact) findings.push({ code: 'ACTION_CUT_MID_CONTACT', shotId: shot.shotId });
    if (shot.beatType === 'BUTTON' && shot.durationFrames < thresholds.minButton) findings.push({ code: 'ENDING_BUTTON_TOO_SHORT', shotId: shot.shotId });
  }
  return { schemaVersion: EDIT_RHYTHM_SCHEMA, findings, passed: findings.length === 0 };
}

export function paceProfiles(): readonly PaceProfile[] {
  return PACE_PROFILES;
}

export function transitionTypes(): readonly TransitionType[] {
  return TRANSITIONS;
}
