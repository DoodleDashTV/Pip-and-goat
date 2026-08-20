import { sha256Canonical } from './hash';
import { CAPTION_SCHEMA } from './types';
import type { DialogueEdit } from './dialogue';
import { DEFAULT_VERTICAL_PROFILE, type VerticalCompositionProfile } from './composition';

export type CaptionCue = {
  schemaVersion: typeof CAPTION_SCHEMA;
  captionId: string;
  speaker: 'PIP' | 'GOAT';
  text: string;
  startFrame: number;
  endFrame: number;
  safeRegion: { bottom: number };
  maxLines: number;
  readingSpeed: number;
  captionDependencySha256: string;
};

export type CaptionQcFinding = {
  code:
    | 'TIMING'
    | 'OVERLAP'
    | 'READING_SPEED'
    | 'LINE_LENGTH'
    | 'SAFE_AREA'
    | 'SHOT_BOUNDARY'
    | 'SPEAKER_CHANGE'
    | 'TEXT_OVERFLOW';
  captionId?: string;
};

export function planCaptionCue(input: {
  captionId: string;
  speaker: 'PIP' | 'GOAT';
  text: string;
  startFrame: number;
  endFrame: number;
  profile?: VerticalCompositionProfile;
}): CaptionCue {
  const profile = input.profile ?? DEFAULT_VERTICAL_PROFILE;
  const words = input.text.trim().split(/\s+/).filter(Boolean).length;
  const duration = Math.max(1, input.endFrame - input.startFrame);
  const body = {
    schemaVersion: CAPTION_SCHEMA,
    captionId: input.captionId,
    speaker: input.speaker,
    text: input.text.trim(),
    startFrame: input.startFrame,
    endFrame: input.endFrame,
    safeRegion: { bottom: profile.captionBand },
    maxLines: 2,
    readingSpeed: words / (duration / 30),
    brandSafe: true,
  };
  return { ...body, captionDependencySha256: sha256Canonical({ ...body, brandSafe: undefined }) };
}

export function captionsFromDialogue(edits: DialogueEdit[], textFor: (lineId: string) => string): CaptionCue[] {
  return edits.map((edit) =>
    planCaptionCue({
      captionId: `CAP_${edit.lineId}`,
      speaker: edit.speaker,
      text: textFor(edit.lineId),
      startFrame: edit.startFrame,
      endFrame: edit.endFrame,
    }),
  );
}

export function evaluateCaptionQc(input: {
  captions: CaptionCue[];
  shotRanges: Array<{ shotId: string; inFrame: number; outFrame: number }>;
  faceBoxes?: Array<{ y: number; h: number }>;
  profile?: VerticalCompositionProfile;
}): { findings: CaptionQcFinding[]; passed: boolean } {
  const findings: CaptionQcFinding[] = [];
  const profile = input.profile ?? DEFAULT_VERTICAL_PROFILE;
  const sorted = [...input.captions].sort((left, right) => left.startFrame - right.startFrame || left.captionId.localeCompare(right.captionId));
  for (let index = 0; index < sorted.length; index += 1) {
    const cue = sorted[index]!;
    if (cue.endFrame <= cue.startFrame) findings.push({ code: 'TIMING', captionId: cue.captionId });
    if (cue.readingSpeed > 4) findings.push({ code: 'READING_SPEED', captionId: cue.captionId });
    if (cue.text.length > 84) findings.push({ code: 'LINE_LENGTH', captionId: cue.captionId });
    const lines = Math.ceil(cue.text.length / 42);
    if (lines > cue.maxLines) findings.push({ code: 'TEXT_OVERFLOW', captionId: cue.captionId });
    const next = sorted[index + 1];
    if (next && next.startFrame < cue.endFrame) findings.push({ code: 'OVERLAP', captionId: cue.captionId });
    if (next && next.speaker !== cue.speaker && next.startFrame < cue.endFrame + 2) findings.push({ code: 'SPEAKER_CHANGE', captionId: cue.captionId });
    const coveringShot = input.shotRanges.find((shot) => cue.startFrame >= shot.inFrame && cue.endFrame <= shot.outFrame);
    if (!coveringShot) findings.push({ code: 'SHOT_BOUNDARY', captionId: cue.captionId });
    if (input.faceBoxes?.some((face) => face.y + face.h > 1 - profile.captionBand - 0.02)) {
      findings.push({ code: 'SAFE_AREA', captionId: cue.captionId });
    }
  }
  return { findings, passed: findings.length === 0 };
}

export function formatCaptionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
