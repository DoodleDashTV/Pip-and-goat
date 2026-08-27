'use client';

import { useState } from 'react';

type Draft = { candidate: { authorizationId: string; scope: string; costCeilingUsd: number; authorizationReceiptSha256: string }; validation: { valid: boolean; errors: string[] }; explicitAuthorizationRecorded: false; authority: { paidExecutionAuthorized: false } };

export function Ep001PaidAuthorizationDraft() {
  const [authorizationId, setAuthorizationId] = useState('');
  const [scope, setScope] = useState<'EP001_VOICE_GENERATION' | 'EP001_FINAL_RENDER'>('EP001_VOICE_GENERATION');
  const [cost, setCost] = useState('1.00');
  const [oneShot, setOneShot] = useState(true);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setError(null); setDraft(null);
    const response = await fetch('/api/episode-one/paid-authorization/draft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationId, scope, costCeilingUsd: Number(cost), oneShot, note }),
    });
    const payload = await response.json();
    if (!response.ok) { setError(String(payload.error ?? payload.validation?.errors?.join(',') ?? 'DRAFT_INVALID')); return; }
    setDraft(payload as Draft);
  }

  return (
    <section className="studio-card space-y-4 p-4 sm:p-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">Paid execution preparation</p><h2 className="mt-1 font-display text-2xl font-bold">Prepare bounded authorization metadata</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">Draft-only. This helps fill the exact scope and ceiling ahead of time; clicking here cannot authorize ElevenLabs, RunPod, GPU work, or Production.</p></div>
      <label className="block text-sm font-bold">Authorization ID<input value={authorizationId} onChange={(e) => setAuthorizationId(e.target.value)} placeholder="Example: EP001-VOICE-CANARY-001" className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm" /></label>
      <label className="block text-sm font-bold">Scope<select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm"><option>EP001_VOICE_GENERATION</option><option>EP001_FINAL_RENDER</option></select></label>
      <label className="block text-sm font-bold">Maximum spend (USD)<input type="number" min="0.01" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm" /></label>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={oneShot} onChange={(e) => setOneShot(e.target.checked)} /> One-shot only</label>
      <label className="block text-sm font-bold">Note<textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm" /></label>
      <button type="button" disabled={!authorizationId.trim() || Number(cost) <= 0} onClick={() => void prepare()} className="min-h-touch rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Prepare draft metadata</button>
      {error ? <p className="rounded-xl border border-[var(--color-danger)] p-3 font-mono text-xs">{error}</p> : null}
      {draft ? <div className="rounded-xl border border-[var(--color-warning)] p-3 text-sm"><p className="font-bold">Valid draft: {String(draft.validation.valid)} · explicit authorization recorded: no · paid execution authorized: no</p><p className="mt-2 break-all font-mono text-xs">Metadata SHA-256: {draft.candidate.authorizationReceiptSha256}</p></div> : null}
    </section>
  );
}
