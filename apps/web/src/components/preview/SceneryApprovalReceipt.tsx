'use client';

import { useState } from 'react';

export function SceneryApprovalReceiptForm({
  assetCandidate,
  sourceId,
  inspectionHash,
  visualEvidence,
  semanticRoles,
  licenseState,
  provenanceState,
  canonicalState,
  synthetic = true,
  onConfirm,
}: {
  assetCandidate: string;
  sourceId: string;
  inspectionHash: string;
  visualEvidence: string;
  semanticRoles: string[];
  licenseState: string;
  provenanceState: string;
  canonicalState: string;
  synthetic?: boolean;
  onConfirm?: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <section className="studio-card space-y-3 p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">Human approval receipt</h2>
      {synthetic ? <p className="text-sm font-bold">SYNTHETIC PREVIEW FIXTURE — not a real commercial approval</p> : null}
      <p className="text-sm">Asset candidate: {assetCandidate}</p>
      <p className="text-sm">Source ID: {sourceId}</p>
      <p className="text-sm break-all">Inspection hash: {inspectionHash}</p>
      <p className="text-sm break-all">Visual evidence: {visualEvidence}</p>
      <p className="text-sm">Semantic roles: {semanticRoles.join(', ')}</p>
      <p className="text-sm">License: {licenseState}</p>
      <p className="text-sm">Provenance: {provenanceState}</p>
      <p className="text-sm">Canonical: {canonicalState}</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>I confirm this exact receipt. This does not silently promote an unapproved source.</span>
      </label>
      <button
        type="button"
        disabled={!checked}
        className="rounded-xl px-3 py-2 text-sm font-bold underline disabled:opacity-40"
        onClick={() => checked && onConfirm?.()}
      >
        Confirm human approval
      </button>
    </section>
  );
}
