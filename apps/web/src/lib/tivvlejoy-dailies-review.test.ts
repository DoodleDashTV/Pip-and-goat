import { describe, expect, it } from 'vitest';
import {
  addDailiesNote,
  approvalAreas,
  createRevisionRequest,
  emptyApprovalMatrix,
  evaluateChangeImpact,
  nextRevisionId,
  recordApprovalArea,
  reviewCategories,
} from './tivvlejoy-nightshift-production';

describe('dailies, revisions, and approvals', () => {
  it('creates notes that cannot auto-approve', () => {
    const note = addDailiesNote({
      reviewId: 'R1',
      shotId: 'SH01',
      shotDependencySha256: 'aa'.repeat(32),
      reviewerClass: 'SYNTHETIC_OPERATOR',
      reviewCategory: 'PERFORMANCE',
      note: 'Hold Goat reaction 12 frames longer.',
      severity: 'MUST_FIX',
      frameRange: { start: 40, end: 52 },
      createdAt: '1970-01-01T00:00:00.000Z',
      resolvedByRevision: null,
    });
    expect(note.autoApproved).toBe(false);
    expect(note.status).toBe('OPEN');
  });

  it('turns a hold-longer note into a precise revision', () => {
    const note = addDailiesNote({
      reviewId: 'R2',
      shotId: 'SH02',
      shotDependencySha256: 'bb'.repeat(32),
      reviewerClass: 'HUMAN',
      reviewCategory: 'PERFORMANCE',
      note: 'Hold Goat reaction 12 frames longer.',
      severity: 'MUST_FIX',
      frameRange: { start: 10, end: 22 },
      createdAt: '1970-01-01T00:00:00.000Z',
      resolvedByRevision: null,
    });
    const revision = createRevisionRequest({ note, instruction: note.note, requestedDeltaFrames: 12, fromRevisionId: 'SHOT_V1' });
    expect(revision.toRevisionId).toBe('SHOT_V2');
    expect(revision.selectedBinding).toBe('SHOT_V2');
    expect(revision.impacts).toEqual(expect.arrayContaining(['performance timing', 'shot edit duration']));
    expect(revision.doesNotInvalidate).toContain('unrelated scenery source hash');
  });

  it('never uses mutable latest as the selected binding', () => {
    expect(nextRevisionId('SHOT_V3')).toBe('SHOT_V4');
    expect(nextRevisionId('SHOT_V4')).not.toBe('latest');
  });

  it('keeps synthetic approval matrices from becoming final', () => {
    const matrix = emptyApprovalMatrix('SH03');
    const next = recordApprovalArea(matrix, 'CAMERA_APPROVED', false);
    expect(next.finalApproved).toBe(false);
    expect(next.syntheticCannotFinalize).toBe(true);
    expect(next.areas.CAMERA_APPROVED).toBe(false);
    expect(approvalAreas()).toHaveLength(8);
    expect(reviewCategories()).toHaveLength(13);
  });

  for (const category of reviewCategories()) {
    it(`keeps a ${category} note from auto-approving`, () => {
      const note = addDailiesNote({
        reviewId: `N_${category}`,
        shotId: 'SH09',
        shotDependencySha256: 'cc'.repeat(32),
        reviewerClass: 'SYNTHETIC_OPERATOR',
        reviewCategory: category,
        note: `${category} check`,
        severity: 'NOTE',
        frameRange: { start: 0, end: 8 },
        createdAt: '1970-01-01T00:00:00.000Z',
        resolvedByRevision: null,
      });
      expect(note.autoApproved).toBe(false);
      expect(note.reviewSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  it('maps change kinds to minimal invalidation', () => {
    expect(evaluateChangeImpact('CAMERA').preserves).toContain('voice receipt');
    expect(evaluateChangeImpact('LIGHTING').preserves).toContain('voice receipt');
    expect(evaluateChangeImpact('VOICE_RECEIPT').preserves).toContain('scenery source inspection');
    expect(evaluateChangeImpact('CAPTION').preserves).toContain('animation manifest');
    expect(evaluateChangeImpact('SCENERY_ASSET').preserves).toContain('unrelated character performances');
  });
});
