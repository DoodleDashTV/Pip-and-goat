import { VISUAL_EVIDENCE_QUEUE_SCHEMA } from './types';
import type { ProductionSemanticRole, QualityTier } from './types';

export type VisualShot =
  | 'front'
  | 'rear'
  | 'side'
  | 'three-quarter'
  | 'close material view'
  | 'story-camera view'
  | 'scale reference view'
  | 'entrance'
  | 'interior'
  | 'camera corridor'
  | 'hero angle';

export type VisualEvidenceQueue = {
  schemaVersion: typeof VISUAL_EVIDENCE_QUEUE_SCHEMA;
  assetCandidateId: string;
  requiredShots: VisualShot[];
  state: 'VISUAL_REVIEW_REQUIRED' | 'VISUAL_EVIDENCE_RENDER_PENDING' | 'VISUAL_EVIDENCE_QUEUED';
  visualApprovalAutomatic: false;
  gpu: false;
  paidCompute: false;
  finalRender: false;
  previewPolicy: {
    allowed: boolean;
    maxResolutionPx: 512;
    lighting: 'simple-neutral';
    watermark: 'INSPECTION';
    blenderRequired: true;
  };
};

export function queueVisualEvidence(input: {
  assetCandidateId: string;
  roles: readonly ProductionSemanticRole[];
  quality: readonly QualityTier[];
  blenderPreviewAvailable?: boolean;
}): VisualEvidenceQueue {
  const required = new Set<VisualShot>(['front', 'rear', 'side', 'three-quarter', 'close material view', 'story-camera view', 'scale reference view']);
  if (input.roles.includes('INTERIOR_SHELL')) {
    required.add('entrance');
    required.add('interior');
    required.add('camera corridor');
    required.add('hero angle');
  }
  const hero = input.quality.includes('HERO') || input.roles.some((role) => role.endsWith('_HERO') || role === 'INTERIOR_SHELL');
  return {
    schemaVersion: VISUAL_EVIDENCE_QUEUE_SCHEMA,
    assetCandidateId: input.assetCandidateId,
    requiredShots: [...required],
    state: hero
      ? input.blenderPreviewAvailable
        ? 'VISUAL_EVIDENCE_QUEUED'
        : 'VISUAL_EVIDENCE_RENDER_PENDING'
      : 'VISUAL_EVIDENCE_QUEUED',
    visualApprovalAutomatic: false,
    gpu: false,
    paidCompute: false,
    finalRender: false,
    previewPolicy: {
      allowed: Boolean(input.blenderPreviewAvailable),
      maxResolutionPx: 512,
      lighting: 'simple-neutral',
      watermark: 'INSPECTION',
      blenderRequired: true,
    },
  };
}
