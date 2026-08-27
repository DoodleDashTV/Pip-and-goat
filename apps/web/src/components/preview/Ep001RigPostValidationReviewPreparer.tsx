'use client';

import { useState } from 'react';

type CharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';
type Packet = { structurallyReadyForHumanReview: boolean; errors: string[]; reviewSubjectSha256: string; targetDecisionId: string; requiredTestCount: number; reviewerMustInspect: string[] };

const fields = [
  'rigVersionId','rigSourceSha256','rigReceiptSha256','adapterSha256','adapterReceiptSha256','validationJobSha256','validationResultSha256','deformationEvidenceSha256','inspectionEvidenceBundleSha256',
] as const;
type Field = typeof fields[number];

export function Ep001RigPostValidationReviewPreparer({ characterId }: { characterId: CharacterId }) {
  const [values, setValues] = useState<Record<Field, string>>(Object.fromEntries(fields.map((field) => [field, ''])) as Record<Field, string>);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = characterId === 'CHAR_PIP_001' ? 'Pip' : 'Goat';

  async function prepare() {
    setError(null);
    const response = await fetch('/api/episode-one/rig-post-validation-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId, ...values }) });
    const payload = await response.json().catch(() => ({ code: 'RIG_REVIEW_RESPONSE_INVALID' }));
    if (!response.ok && response.status !== 422) { setError(String(payload.code ?? 'RIG_REVIEW_PREPARE_FAILED')); return; }
    setPacket(payload as Packet);
  }

  return <section className="studio-card space-y-4 p-4 sm:p-5">
    <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">{label} final rig review</p><h2 className="mt-1 font-display text-2xl font-bold">Compile exact human-review subject</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">Fill from verified receipts only. This prepares a review packet; it cannot approve the rig.</p></div>
    <div className="grid gap-3">
      {fields.map((field) => <label key={field} className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{field}<input value={values[field]} onChange={(e) => { setPacket(null); setValues((current) => ({ ...current, [field]: e.target.value })); }} className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-mono text-xs" /></label>)}
    </div>
    <button type="button" onClick={() => void prepare()} className="min-h-touch rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Prepare {label} review packet</button>
    {error ? <p className="rounded-xl border border-[var(--color-danger)] p-3 font-mono text-xs">{error}</p> : null}
    {packet ? <div className={`rounded-xl border p-3 text-sm ${packet.structurallyReadyForHumanReview ? 'border-[var(--color-success)]' : 'border-[var(--color-warning)]'}`}><p className="font-bold">{packet.structurallyReadyForHumanReview ? 'Structurally ready for human review — NOT approved' : 'Review packet incomplete'}</p><p className="mt-1 font-mono text-xs">Target: {packet.targetDecisionId}</p><p className="mt-1 break-all font-mono text-xs">Subject SHA-256: {packet.reviewSubjectSha256}</p>{packet.errors.length ? <ul className="mt-2 list-disc pl-5 font-mono text-xs">{packet.errors.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div> : null}
  </section>;
}
