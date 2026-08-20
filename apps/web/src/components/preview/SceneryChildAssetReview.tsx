'use client';

import { useState } from 'react';
import type { InspectedSourceReport } from '@/lib/tivvlejoy-real-scenery-inspection/pipeline';

export function SceneryChildAssetReview({
  reports,
  onMarkForReview,
  onApproveClassification,
  onRejectClassification,
}: {
  reports: InspectedSourceReport[];
  onMarkForReview?: (candidateId: string) => void;
  onApproveClassification?: (candidateId: string) => void;
  onRejectClassification?: (candidateId: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const children = reports.flatMap((report) =>
    report.children.map((child, index) => ({ child, evidence: report.evidenceByChild[index]!, sourceId: report.receipt.sourceId })),
  );

  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Child asset review</h2>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          Classification actions are metadata-only. Real asset approval requires an explicit human receipt with the exact
          inspection and visual evidence hashes.
        </p>
      </div>
      {children.map(({ child, evidence, sourceId }) => (
        <article key={child.assetCandidateId} className="studio-card space-y-2 p-4 sm:p-5">
          <p className="text-sm font-bold">{child.displayName}</p>
          <p className="text-sm">Candidate: {child.assetCandidateId}</p>
          <p className="text-sm">Source: {sourceId}</p>
          <p className="text-sm">Kind: {child.assetKind}</p>
          <p className="text-sm">Roles: {evidence.semanticClassification.roles.join(', ') || 'unclassified'}</p>
          <p className="text-sm">Quality: {evidence.quality.tiers.join(', ')}</p>
          <p className="text-sm">Depth: {evidence.depth.tiers.join(', ')}</p>
          <p className="text-sm">
            Archetypes: {evidence.archetypes.archetypes.map((item) => `${item.id}:${item.confidence}`).join(', ') || 'none'}
          </p>
          <p className="text-sm">Geometry: {evidence.geometryFindings.budget.triangleEstimate ?? 'unknown'} tris</p>
          <p className="text-sm">Materials: {evidence.materialFindings.materialCount}</p>
          <p className="text-sm">Textures: {evidence.textureFindings.textureCount}</p>
          <p className="text-sm">Dependencies: {evidence.dependencyFindings.blockers.join(', ') || 'complete'}</p>
          <p className="text-sm">Style: {evidence.styleClassification.state}</p>
          <p className="text-sm">Canonical: {evidence.canonicalRecommendation.state}</p>
          <p className="text-sm">Visual: pending human review</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="rounded-xl px-3 py-2 text-sm font-bold underline" onClick={() => onMarkForReview?.(child.assetCandidateId)}>
              Mark for review
            </button>
            <button type="button" className="rounded-xl px-3 py-2 text-sm font-bold underline" onClick={() => onApproveClassification?.(child.assetCandidateId)}>
              Approve metadata classification
            </button>
            <button type="button" className="rounded-xl px-3 py-2 text-sm font-bold underline" onClick={() => onRejectClassification?.(child.assetCandidateId)}>
              Reject classification
            </button>
            <button
              type="button"
              className="rounded-xl px-3 py-2 text-sm font-bold"
              onClick={() => setConfirmId(child.assetCandidateId)}
            >
              Human approval requires confirmation
            </button>
          </div>
          {confirmId === child.assetCandidateId ? (
            <p className="text-sm font-bold">
              Preview fixture approval is synthetic. No button here silently promotes a production asset.
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
