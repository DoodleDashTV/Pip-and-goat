import { sha256Canonical } from './hash';
import {
  APPROVAL_AREAS,
  DAILIES_SCHEMA,
  REVIEW_CATEGORIES,
  REVIEW_STATUSES,
  REVISION_SCHEMA,
  type ApprovalArea,
  type ReviewCategory,
  type ReviewStatus,
} from './types';

export type DailiesNote = {
  schemaVersion: typeof DAILIES_SCHEMA;
  reviewId: string;
  shotId: string;
  shotDependencySha256: string;
  reviewerClass: 'HUMAN' | 'SYNTHETIC_OPERATOR';
  reviewCategory: ReviewCategory;
  note: string;
  severity: 'NOTE' | 'WARNING' | 'MUST_FIX';
  frameRange: { start: number; end: number };
  status: ReviewStatus;
  createdAt: string;
  resolvedByRevision: string | null;
  autoApproved: false;
  reviewSha256: string;
};

export type RevisionRequest = {
  schemaVersion: typeof REVISION_SCHEMA;
  revisionId: string;
  shotId: string;
  fromNoteId: string;
  instruction: string;
  requestedDeltaFrames?: number;
  impacts: string[];
  doesNotInvalidate: string[];
  fromRevisionId: string;
  toRevisionId: string;
  selectedBinding: string;
  revisionSha256: string;
};

export type ShotApprovalMatrix = {
  shotId: string;
  areas: Record<ApprovalArea, boolean>;
  mandatory: ApprovalArea[];
  finalApproved: false;
  syntheticCannotFinalize: true;
  matrixSha256: string;
};

export function addDailiesNote(input: Omit<DailiesNote, 'schemaVersion' | 'autoApproved' | 'reviewSha256' | 'status'> & { status?: ReviewStatus }): DailiesNote {
  const body = {
    schemaVersion: DAILIES_SCHEMA,
    autoApproved: false as const,
    status: input.status ?? 'OPEN',
    ...input,
  };
  const { status: _status, ...rest } = input;
  void _status;
  return {
    schemaVersion: DAILIES_SCHEMA,
    autoApproved: false,
    ...rest,
    status: input.status ?? 'OPEN',
    reviewSha256: sha256Canonical({
      reviewId: input.reviewId,
      shotId: input.shotId,
      shotDependencySha256: input.shotDependencySha256,
      reviewCategory: input.reviewCategory,
      note: input.note,
      severity: input.severity,
      frameRange: input.frameRange,
    }),
  };
}

export function createRevisionRequest(input: {
  note: DailiesNote;
  instruction: string;
  requestedDeltaFrames?: number;
  fromRevisionId: string;
}): RevisionRequest {
  const toRevisionId = nextRevisionId(input.fromRevisionId);
  const impacts = impactsFor(input.note.reviewCategory, input.instruction);
  const doesNotInvalidate = preservedFor(input.note.reviewCategory);
  const body = {
    schemaVersion: REVISION_SCHEMA,
    revisionId: `${input.note.shotId}_${toRevisionId}`,
    shotId: input.note.shotId,
    fromNoteId: input.note.reviewId,
    instruction: input.instruction,
    requestedDeltaFrames: input.requestedDeltaFrames,
    impacts,
    doesNotInvalidate,
    fromRevisionId: input.fromRevisionId,
    toRevisionId,
    selectedBinding: toRevisionId,
  };
  return { ...body, revisionSha256: sha256Canonical(body) };
}

export function nextRevisionId(current: string): string {
  const match = /^SHOT_V(\d+)$/.exec(current);
  const next = match ? Number(match[1]) + 1 : 2;
  return `SHOT_V${next}`;
}

export function emptyApprovalMatrix(shotId: string, mandatory: ApprovalArea[] = [...APPROVAL_AREAS]): ShotApprovalMatrix {
  const areas = Object.fromEntries(APPROVAL_AREAS.map((area) => [area, false])) as Record<ApprovalArea, boolean>;
  return {
    shotId,
    areas,
    mandatory,
    finalApproved: false,
    syntheticCannotFinalize: true,
    matrixSha256: sha256Canonical({ shotId, areas, mandatory }),
  };
}

export function recordApprovalArea(matrix: ShotApprovalMatrix, area: ApprovalArea, human: boolean): ShotApprovalMatrix {
  if (!human) return matrix;
  const areas = { ...matrix.areas, [area]: true };
  return {
    ...matrix,
    areas,
    finalApproved: false,
    syntheticCannotFinalize: true,
    matrixSha256: sha256Canonical({ shotId: matrix.shotId, areas, mandatory: matrix.mandatory }),
  };
}

function impactsFor(category: ReviewCategory, instruction: string): string[] {
  if (category === 'PERFORMANCE' || /reaction|hold|frames/i.test(instruction)) {
    return ['performance timing', 'shot animation manifest', 'shot edit duration', 'downstream audio/caption timing', 'final shot spec'];
  }
  if (category === 'CAMERA') return ['camera', 'composition QC', 'staging visibility', 'final shot spec', 'render dependency'];
  if (category === 'LIGHTING') return ['lighting', 'visual approval', 'render dependency', 'final shot spec'];
  if (category === 'SCENERY') return ['environment resolution', 'dependent shot assembly', 'final shot spec'];
  if (category === 'DIALOGUE') return ['viseme', 'performance timing', 'edit', 'caption', 'audio'];
  if (category === 'CAPTIONS') return ['caption plan', 'master timeline captions'];
  return ['final shot spec'];
}

function preservedFor(category: ReviewCategory): string[] {
  if (category === 'CAMERA') return ['voice source', 'scenery source inspection'];
  if (category === 'DIALOGUE') return ['scenery source hash', 'approved asset identity'];
  if (category === 'LIGHTING') return ['voice receipt', 'dialogue wording'];
  if (category === 'SCENERY') return ['unrelated character performances', 'voice receipt'];
  if (category === 'PERFORMANCE') return ['unrelated scenery source hash', 'voice identity'];
  return ['unrelated scenery source hash'];
}

export function reviewCategories(): readonly ReviewCategory[] {
  return REVIEW_CATEGORIES;
}
export function reviewStatuses(): readonly ReviewStatus[] {
  return REVIEW_STATUSES;
}
export function approvalAreas(): readonly ApprovalArea[] {
  return APPROVAL_AREAS;
}
