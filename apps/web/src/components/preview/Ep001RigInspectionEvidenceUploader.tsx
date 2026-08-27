'use client';

import { useMemo, useState } from 'react';
import type { RigCharacterId, RigEvidenceSlot } from '@/lib/tivvlejoy-ep001-rig-inspection-evidence';

const API = '/api/episode-one/rig-inspection-evidence';
const TOKEN_HEADER = 'x-tivvlejoy-character-intake-token';

type Created = { evidenceId: string; partCount: number; parts: Array<{ partNumber: number; start: number; end: number }> };
type Receipt = { evidenceId: string; evidenceSha256: string; receiptSha256: string; slotId: string; rigVersionId: string };
type InitialRigBinding = { rigVersionId: string; rigSourceSha256: string; rigReceiptSha256?: string } | null;

async function post(token: string, body: Record<string, unknown>) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: token },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ code: 'RIG_EVIDENCE_RESPONSE_INVALID' }));
  if (!response.ok) throw new Error(String(payload.code ?? payload.error ?? 'RIG_EVIDENCE_REFUSED'));
  return payload as Record<string, unknown>;
}

export function Ep001RigInspectionEvidenceUploader({ characterId, slots, initialRigBinding = null }: { characterId: RigCharacterId; slots: RigEvidenceSlot[]; initialRigBinding?: InitialRigBinding }) {
  const [rigVersionId, setRigVersionId] = useState(initialRigBinding?.rigVersionId ?? '');
  const [rigSourceSha256, setRigSourceSha256] = useState(initialRigBinding?.rigSourceSha256 ?? '');
  const [slotId, setSlotId] = useState(slots[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [token, setToken] = useState('');
  const [state, setState] = useState(initialRigBinding ? 'RIG_BINDING_RECEIVED_FROM_VERIFIED_UPLOAD' : 'WAITING_FOR_RIG_BINDING');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const label = characterId === 'CHAR_PIP_001' ? 'Pip' : 'Goat';
  const selected = useMemo(() => slots.find((slot) => slot.id === slotId), [slotId, slots]);
  const ready = Boolean(rigVersionId.trim() && /^[a-f0-9]{64}$/i.test(rigSourceSha256.trim()) && slotId && file && token.trim() && !receipt);

  async function upload() {
    if (!ready || !file) return;
    setError(null);
    setProgress(0);
    setState('OPENING_EVIDENCE_SESSION');
    let evidenceId = '';
    try {
      const created = await post(token, {
        action: 'create', characterId, rigVersionId: rigVersionId.trim(), rigSourceSha256: rigSourceSha256.trim().toLowerCase(),
        slotId, originalFilename: file.name, byteSize: file.size,
      }) as unknown as Created;
      evidenceId = created.evidenceId;
      const parts: Array<{ partNumber: number; etag: string }> = [];
      for (let i = 0; i < created.parts.length; i += 1) {
        const part = created.parts[i]!;
        setState(`UPLOADING_PART_${part.partNumber}_OF_${created.partCount}`);
        const signed = await post(token, { action: 'sign-part', characterId, rigVersionId, rigSourceSha256, evidenceId, partNumber: part.partNumber });
        const url = String(signed.url ?? '');
        if (!url.startsWith('https://')) throw new Error('RIG_EVIDENCE_SIGNED_URL_INVALID');
        const put = await fetch(url, { method: 'PUT', body: file.slice(part.start, part.end) });
        if (!put.ok) throw new Error(`RIG_EVIDENCE_PART_UPLOAD_FAILED_${part.partNumber}`);
        const etag = put.headers.get('etag');
        if (!etag) throw new Error(`RIG_EVIDENCE_ETAG_MISSING_${part.partNumber}`);
        parts.push({ partNumber: part.partNumber, etag });
        setProgress(Math.round(((i + 1) / created.parts.length) * 90));
      }
      setState('VERIFYING_EVIDENCE_BYTES');
      const completed = await post(token, { action: 'complete', characterId, rigVersionId, rigSourceSha256, evidenceId, parts }) as unknown as Receipt;
      setReceipt(completed);
      setProgress(100);
      setState('EVIDENCE_RECEIVED_NOT_APPROVED');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'RIG_EVIDENCE_UPLOAD_FAILED');
      setState('RECOVERY_REQUIRED');
      if (evidenceId) {
        try { await post(token, { action: 'abort', characterId, rigVersionId, rigSourceSha256, evidenceId }); } catch { /* preserve original failure */ }
      }
    }
  }

  return (
    <section className="studio-card space-y-4 p-4 sm:p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">{label} inspection evidence</p>
        <h2 className="mt-1 font-display text-2xl font-bold">Bind proof to exact rig delivery</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Evidence can be uploaded only when the exact rig version ID and source SHA-256 are known. Uploading proof never approves the rig.</p>
      </div>
      {initialRigBinding ? <div className="rounded-xl border border-[var(--color-success)] p-3 text-xs"><p className="font-bold">Exact rig receipt binding carried from upload</p>{initialRigBinding.rigReceiptSha256 ? <p className="mt-1 break-all font-mono">Rig receipt SHA-256: {initialRigBinding.rigReceiptSha256}</p> : null}<p className="mt-1">You can change the fields below only if intentionally inspecting a different immutable rig version.</p></div> : null}
      <label className="block text-sm font-bold">Rig version ID
        <input value={rigVersionId} onChange={(e) => setRigVersionId(e.target.value)} placeholder="UUID from rig delivery receipt" className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs" />
      </label>
      <label className="block text-sm font-bold">Rig source SHA-256
        <input value={rigSourceSha256} onChange={(e) => setRigSourceSha256(e.target.value)} placeholder="64-character SHA-256" className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs" />
      </label>
      <label className="block text-sm font-bold">Evidence slot
        <select value={slotId} onChange={(e) => setSlotId(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
          {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.kind} — {slot.required ? 'required' : 'optional'}</option>)}
        </select>
      </label>
      {selected ? <p className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">{selected.purpose}<br />Accepted: {selected.acceptedExtensions.join(', ')}</p> : null}
      <label className="block text-sm font-bold">Evidence file
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm" />
      </label>
      <label className="block text-sm font-bold">Private character intake token
        <input type="password" value={token} autoComplete="off" onChange={(e) => setToken(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm" />
      </label>
      <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm"><p><span className="font-bold">State:</span> {state}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]"><div className="h-full bg-[var(--color-primary)]" style={{ width: `${progress}%` }} /></div></div>
      {error ? <p className="rounded-xl border border-[var(--color-danger)] p-3 font-mono text-xs">{error}</p> : null}
      {receipt ? <div className="rounded-xl border border-[var(--color-success)] p-3 text-sm"><p className="font-bold">Evidence verified — rig still NOT approved</p><p className="mt-2 break-all font-mono text-xs">Evidence SHA-256: {receipt.evidenceSha256}</p><p className="mt-1 break-all font-mono text-xs">Receipt SHA-256: {receipt.receiptSha256}</p></div> : <button type="button" disabled={!ready} onClick={() => void upload()} className="min-h-touch rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Upload {label} evidence privately</button>}
    </section>
  );
}
