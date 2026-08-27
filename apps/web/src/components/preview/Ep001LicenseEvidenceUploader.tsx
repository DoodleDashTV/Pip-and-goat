'use client';

import { useState } from 'react';

type EvidenceKind = 'PURCHASE_RECEIPT' | 'LICENSE_TEXT' | 'SELLER_GRANT';
type Created = { evidenceId: string; partCount: number; parts: Array<{ partNumber: number; start: number; end: number }> };
type Receipt = { sourceId: string; evidenceId: string; evidenceSha256: string; receiptSha256: string; commercialUseVerified: false; humanReviewed: false; admittedForEp001: false };

const API = '/api/episode-one/external-evidence-intake';
const HEADER = 'x-tivvlejoy-evidence-intake-token';

async function post(token: string, body: Record<string, unknown>) {
  const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', [HEADER]: token }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({ code: 'EVIDENCE_RESPONSE_INVALID' }));
  if (!response.ok) throw new Error(String(payload.code ?? payload.error ?? 'EVIDENCE_INTAKE_REFUSED'));
  return payload as Record<string, unknown>;
}

export function Ep001LicenseEvidenceUploader() {
  const [sourceId, setSourceId] = useState('VILLAGE_FBX_V1');
  const [kind, setKind] = useState<EvidenceKind>('PURCHASE_RECEIPT');
  const [productIdentity, setProductIdentity] = useState('');
  const [note, setNote] = useState('');
  const [token, setToken] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('WAITING');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function upload() {
    if (!file || !sourceId.trim() || !productIdentity.trim() || !token.trim()) return;
    setError(null); setReceipt(null); setProgress(0);
    let evidenceId: string | null = null;
    try {
      setStatus('OPENING_PRIVATE_EVIDENCE_SESSION');
      const created = await post(token, { action: 'create', sourceId: sourceId.trim(), evidenceKind: kind, productIdentity: productIdentity.trim(), originalFilename: file.name, byteSize: file.size, note: note.trim() }) as unknown as Created;
      evidenceId = created.evidenceId;
      const completedParts: Array<{ partNumber: number; etag: string }> = [];
      for (let index = 0; index < created.parts.length; index += 1) {
        const part = created.parts[index]!;
        setStatus(`UPLOADING_PART_${part.partNumber}_OF_${created.partCount}`);
        const signed = await post(token, { action: 'sign-part', sourceId: sourceId.trim(), evidenceId, partNumber: part.partNumber });
        const url = String(signed.url ?? '');
        if (!url.startsWith('https://')) throw new Error('EVIDENCE_SIGNED_URL_INVALID');
        const put = await fetch(url, { method: 'PUT', body: file.slice(part.start, part.end) });
        if (!put.ok) throw new Error(`EVIDENCE_PART_UPLOAD_FAILED_${part.partNumber}`);
        const etag = put.headers.get('etag');
        if (!etag) throw new Error(`EVIDENCE_ETAG_MISSING_${part.partNumber}`);
        completedParts.push({ partNumber: part.partNumber, etag });
        setProgress(Math.round(((index + 1) / created.parts.length) * 90));
      }
      setStatus('VERIFYING_EVIDENCE_HASH');
      const completed = await post(token, { action: 'complete', sourceId: sourceId.trim(), evidenceId, parts: completedParts }) as unknown as Receipt;
      setReceipt(completed); setProgress(100); setStatus('EVIDENCE_RECEIVED_REVIEW_REQUIRED');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'EVIDENCE_UPLOAD_FAILED');
      setStatus('RECOVERY_REQUIRED');
      if (evidenceId) { try { await post(token, { action: 'abort', sourceId: sourceId.trim(), evidenceId }); } catch { /* preserve primary error */ } }
    }
  }

  const ready = Boolean(file && sourceId.trim() && productIdentity.trim() && token.trim() && !receipt);
  return (
    <section className="studio-card space-y-4 p-4 sm:p-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">Scenery licensing</p><h2 className="mt-1 font-display text-2xl font-bold">Upload purchase/license evidence</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">PDF/image/text evidence is stored privately and hash-bound. Receipt upload does not verify commercial rights by itself.</p></div>
      <label className="block text-sm font-bold">Source ID<input value={sourceId} onChange={(e) => setSourceId(e.target.value.toUpperCase())} className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 font-mono text-sm" /></label>
      <label className="block text-sm font-bold">Evidence type<select value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm"><option>PURCHASE_RECEIPT</option><option>LICENSE_TEXT</option><option>SELLER_GRANT</option></select></label>
      <label className="block text-sm font-bold">Exact product identity<input value={productIdentity} onChange={(e) => setProductIdentity(e.target.value)} placeholder="Marketplace + exact product name/order reference" className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm" /></label>
      <label className="block text-sm font-bold">Evidence file<input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm" /></label>
      <label className="block text-sm font-bold">Note<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="mt-2 min-h-20 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm" /></label>
      <label className="block text-sm font-bold">Private evidence intake token<input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm" /></label>
      <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm"><p><b>State:</b> {status}</p><div className="mt-2 h-2 rounded-full bg-[var(--color-surface-subtle)]"><div className="h-2 rounded-full bg-[var(--color-primary)]" style={{ width: `${progress}%` }} /></div></div>
      {error ? <p className="rounded-xl border border-[var(--color-danger)] p-3 font-mono text-xs">{error}</p> : null}
      {receipt ? <div className="rounded-xl border border-[var(--color-success)] p-3 text-sm"><p className="font-bold">Evidence stored — human license review still required</p><p className="mt-2 break-all font-mono text-xs">Evidence SHA-256: {receipt.evidenceSha256}</p><p className="mt-1 break-all font-mono text-xs">Receipt SHA-256: {receipt.receiptSha256}</p><p className="mt-2">Commercial use verified: no · admitted: no.</p></div> : <button type="button" disabled={!ready} onClick={() => void upload()} className="min-h-touch rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Upload license evidence privately</button>}
    </section>
  );
}
