'use client';

import { useState } from 'react';

type Row = { decisionId: string; subjectLabel: string };
type Prepared = { receipt: { decisionId: string; bindingSha256: string; decision: string; receiptSha256: string }; validation: { structurallyValid: boolean; issues: string[] }; authority: { approvalRecorded: false } };

export function Ep001HumanDecisionPreparer({ rows }: { rows: Row[] }) {
  const [decisionId, setDecisionId] = useState(rows[0]?.decisionId ?? '');
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewerId, setReviewerId] = useState('');
  const [evidenceRefs, setEvidenceRefs] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setError(null); setPrepared(null);
    const response = await fetch('/api/episode-one/human-decision/prepare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId, decision, reviewerId, reviewedAt: new Date().toISOString(), evidenceRefs: evidenceRefs.split('\n').map((item) => item.trim()).filter(Boolean) }),
    });
    const payload = await response.json();
    if (!response.ok) { setError(String(payload.error ?? payload.validation?.issues?.join(',') ?? 'PREPARATION_FAILED')); return; }
    setPrepared(payload as Prepared);
  }

  return (
    <section className="studio-card space-y-4 p-4 sm:p-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">Human review</p><h2 className="mt-1 font-display text-2xl font-bold">Prepare SHA-bound decision receipt</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">This computes and validates a receipt against the current decision hash. It does not record approval by itself.</p></div>
      <label className="block text-sm font-bold">Decision gate<select value={decisionId} onChange={(e) => setDecisionId(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm">{rows.map((row) => <option key={row.decisionId} value={row.decisionId}>{row.subjectLabel} · {row.decisionId}</option>)}</select></label>
      <label className="block text-sm font-bold">Decision<select value={decision} onChange={(e) => setDecision(e.target.value as 'APPROVED' | 'REJECTED')} className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm"><option>APPROVED</option><option>REJECTED</option></select></label>
      <label className="block text-sm font-bold">Reviewer ID<input value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm" /></label>
      <label className="block text-sm font-bold">Evidence references — one per line<textarea value={evidenceRefs} onChange={(e) => setEvidenceRefs(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-[var(--color-border)] p-3 font-mono text-xs" /></label>
      <button type="button" disabled={!decisionId || !reviewerId.trim() || !evidenceRefs.trim()} onClick={() => void prepare()} className="min-h-touch rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Prepare receipt</button>
      {error ? <p className="rounded-xl border border-[var(--color-danger)] p-3 font-mono text-xs">{error}</p> : null}
      {prepared ? <div className="rounded-xl border border-[var(--color-success)] p-3 text-sm"><p className="font-bold">Structurally valid: {String(prepared.validation.structurallyValid)} · approval recorded: no</p><p className="mt-2 break-all font-mono text-xs">Binding SHA-256: {prepared.receipt.bindingSha256}</p><p className="mt-1 break-all font-mono text-xs">Receipt SHA-256: {prepared.receipt.receiptSha256}</p></div> : null}
    </section>
  );
}
