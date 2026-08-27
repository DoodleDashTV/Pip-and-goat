'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  parseRigUploadRecovery,
  rigUploadRecoveryKey,
  serializeRigUploadRecovery,
  TIVVLEJOY_RIG_UPLOAD_BROWSER_RECOVERY_SCHEMA,
  type RigUploadBrowserRecovery,
  type RigUploadRecoveryCharacterId,
  type RigUploadRecoveryCompletedPart,
} from '@/lib/tivvlejoy-rig-upload-browser-recovery';

type CharacterId = RigUploadRecoveryCharacterId;
type PlannedPart = { partNumber: number; start: number; end: number };
type CreatedResponse = { versionId: string; partCount: number; parts: PlannedPart[]; approved: false };
type CompletedPart = RigUploadRecoveryCompletedPart;
type ActiveUpload = RigUploadBrowserRecovery;
type CompletedResponse = {
  versionId: string;
  characterId: CharacterId;
  sourceSha256: string;
  byteSize: number;
  receiptSha256: string;
  uploadVerified: boolean;
  technicalInspectionPassed: false;
  humanApproved: false;
  episodeAdmitted: false;
};

const API = '/api/episode-one/rig-delivery-intake';
const TOKEN_HEADER = 'x-tivvlejoy-character-intake-token';

async function postIntake(token: string, body: Record<string, unknown>) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: token },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ code: 'RIG_INTAKE_RESPONSE_INVALID' }));
  if (!response.ok) throw new Error(String(payload.code ?? payload.error ?? 'RIG_INTAKE_REFUSED'));
  return payload as Record<string, unknown>;
}

function humanBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function receiptQuery(receipt: CompletedResponse) {
  const params = new URLSearchParams({
    characterId: receipt.characterId,
    rigVersionId: receipt.versionId,
    rigSourceSha256: receipt.sourceSha256,
    rigReceiptSha256: receipt.receiptSha256,
  });
  return params.toString();
}

export function Ep001RigDeliveryUploader({ characterId }: { characterId: CharacterId }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('WAITING_FOR_FILE');
  const [progress, setProgress] = useState(0);
  const [receipt, setReceipt] = useState<CompletedResponse | null>(null);
  const [active, setActive] = useState<ActiveUpload | null>(null);
  const [recoveryHydrated, setRecoveryHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = characterId === 'CHAR_PIP_001' ? 'Pip' : 'Goat';
  const fileSummary = useMemo(() => file ? `${file.name} · ${humanBytes(file.size)}` : 'No file selected', [file]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(rigUploadRecoveryKey(characterId));
      if (raw) {
        const parsed = parseRigUploadRecovery(raw, characterId);
        if (parsed) {
          setActive(parsed);
          setNote(parsed.artistVersionNote);
          setProgress(Math.round((parsed.completedParts.length / Math.max(1, parsed.partCount)) * 90));
          setStatus('RECOVERY_RECORD_FOUND_RESELECT_SAME_FILE');
        } else {
          window.localStorage.removeItem(rigUploadRecoveryKey(characterId));
        }
      }
    } catch {
      // Browser storage is optional; upload still works without cross-reload recovery.
    } finally {
      setRecoveryHydrated(true);
    }
  }, [characterId]);

  useEffect(() => {
    if (!recoveryHydrated) return;
    try {
      if (active) window.localStorage.setItem(rigUploadRecoveryKey(characterId), serializeRigUploadRecovery(active));
      else window.localStorage.removeItem(rigUploadRecoveryKey(characterId));
    } catch {
      // Never block uploads because browser persistence is unavailable.
    }
  }, [active, characterId, recoveryHydrated]);

  async function upload() {
    if (!file || !note.trim() || !token.trim()) return;
    setError(null);
    setReceipt(null);
    try {
      let session = active;
      if (session && (
        session.filename !== file.name ||
        session.byteSize !== file.size ||
        session.lastModified !== file.lastModified
      )) {
        throw new Error('RIG_RECOVERY_FILE_DOES_NOT_MATCH_OPEN_SESSION');
      }
      if (session && session.artistVersionNote !== note.trim()) {
        throw new Error('RIG_RECOVERY_VERSION_NOTE_DOES_NOT_MATCH_OPEN_SESSION');
      }
      if (!session) {
        setStatus('OPENING_PRIVATE_UPLOAD_SESSION');
        const created = await postIntake(token, {
          action: 'create', characterId, originalFilename: file.name, byteSize: file.size,
          artistVersionNote: note.trim(), lastModified: file.lastModified,
        }) as unknown as CreatedResponse;
        const now = new Date().toISOString();
        session = {
          ...created,
          recoverySchema: TIVVLEJOY_RIG_UPLOAD_BROWSER_RECOVERY_SCHEMA,
          characterId,
          filename: file.name,
          byteSize: file.size,
          lastModified: file.lastModified,
          artistVersionNote: note.trim(),
          completedParts: [],
          openedAt: now,
          updatedAt: now,
        };
        setActive(session);
      }

      const completedParts: CompletedPart[] = [...session.completedParts];
      for (let index = 0; index < session.parts.length; index += 1) {
        const part = session.parts[index]!;
        if (completedParts.some((item) => item.partNumber === part.partNumber)) continue;
        setStatus(`UPLOADING_PART_${part.partNumber}_OF_${session.partCount}`);
        const signed = await postIntake(token, { action: 'sign-part', characterId, versionId: session.versionId, partNumber: part.partNumber });
        const url = String(signed.url ?? '');
        if (!url.startsWith('https://')) throw new Error('RIG_SIGNED_URL_INVALID');
        const chunk = file.slice(part.start, part.end);
        const put = await fetch(url, { method: 'PUT', body: chunk });
        if (!put.ok) throw new Error(`RIG_PART_UPLOAD_FAILED_${part.partNumber}`);
        const etag = put.headers.get('etag');
        if (!etag) throw new Error(`RIG_PART_ETAG_MISSING_${part.partNumber}`);
        completedParts.push({ partNumber: part.partNumber, etag });
        session = { ...session, completedParts: [...completedParts], updatedAt: new Date().toISOString() };
        setActive(session);
        setProgress(Math.round((completedParts.length / session.parts.length) * 90));
      }

      setStatus('VERIFYING_STORED_BYTES_AND_SHA256');
      const completed = await postIntake(token, { action: 'complete', characterId, versionId: session.versionId, parts: completedParts }) as unknown as CompletedResponse;
      setReceipt(completed);
      setActive(null);
      setProgress(100);
      setStatus('RECEIVED_NOT_APPROVED');
    } catch (caught) {
      setStatus('RECOVERY_REQUIRED');
      setError(caught instanceof Error ? caught.message : 'RIG_UPLOAD_FAILED');
    }
  }

  async function abandonOpenSession() {
    if (!active || !token.trim()) return;
    try { await postIntake(token, { action: 'abort', characterId, versionId: active.versionId }); } catch { /* clearing local recovery is still explicit */ }
    setActive(null);
    setError(null);
    setProgress(0);
    setNote('');
    setStatus('WAITING_FOR_FILE');
  }

  const ready = Boolean(file && note.trim() && token.trim() && !receipt);
  const query = receipt ? receiptQuery(receipt) : '';
  return (
    <section className="studio-card space-y-4 p-4 sm:p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">{label} delivery slot</p>
        <h2 className="mt-1 font-display text-2xl font-bold">Upload final corrected rig</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Preferred: the artist-delivered `.blend` file. The original bytes are preserved; upload never equals rig approval.</p>
      </div>

      {active ? <div className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm"><p className="font-bold">Resumable upload found</p><p className="mt-1">Reselect the exact same local file, re-enter the private token, then Retry. The token was not stored.</p><p className="mt-2 break-all font-mono text-[11px]">{active.filename} · {humanBytes(active.byteSize)} · {active.completedParts.length}/{active.partCount} parts · version {active.versionId}</p></div> : null}

      <label className="block text-sm font-bold">Rig file
        <input type="file" accept=".blend,.fbx,.glb,.zip" className="mt-2 block w-full text-sm" disabled={Boolean(receipt)} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <p className="break-all rounded-xl bg-[var(--color-surface-subtle)] p-3 font-mono text-xs">{fileSummary}</p>

      <label className="block text-sm font-bold">Artist/version note
        <textarea value={note} maxLength={1000} disabled={Boolean(receipt) || Boolean(active)} onChange={(event) => setNote(event.target.value)} placeholder="Example: Final corrected Goat rig, delivery v2" className="mt-2 min-h-24 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm disabled:opacity-60" />
      </label>

      <label className="block text-sm font-bold">Private character intake token
        <input type="password" value={token} autoComplete="off" disabled={Boolean(receipt)} onChange={(event) => setToken(event.target.value)} placeholder="Never stored in browser recovery, page, or URL" className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm" />
      </label>

      <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm">
        <p><span className="font-bold">State:</span> {status}</p>
        {active ? <p className="mt-1 break-all font-mono text-[11px]">Open version: {active.versionId} · {active.completedParts.length}/{active.partCount} uploaded parts saved for up to 7 days</p> : null}
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]"><div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${progress}%` }} /></div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{progress}%</p>
      </div>

      {error ? <div className="rounded-xl border border-[var(--color-danger)] p-3 text-sm"><p className="font-bold">Upload paused safely</p><p className="mt-1 font-mono text-xs">{error}</p><p className="mt-2 text-xs">Retry continues missing parts even after a page reload, provided you reselect the exact same file. Use “Abandon” only if you intentionally want a new delivery version.</p></div> : null}

      {receipt ? (
        <div className="rounded-xl border border-[var(--color-success)] p-3 text-sm">
          <p className="font-bold">Private upload verified — still NOT approved</p>
          <p className="mt-2 break-all font-mono text-xs">Version ID: {receipt.versionId}</p>
          <p className="mt-1 break-all font-mono text-xs">Source SHA-256: {receipt.sourceSha256}</p>
          <p className="mt-1 break-all font-mono text-xs">Receipt SHA-256: {receipt.receiptSha256}</p>
          <p className="mt-2">Technical inspection: waiting · human rig approval: waiting · episode admission: blocked.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/episode-one/rig-inspection-evidence-inbox?${query}`} className="min-h-touch rounded-xl bg-[var(--color-primary)] px-4 py-3 font-bold text-white">Continue to evidence inbox</a>
            <a href={`/episode-one/rig-control-adapter?${query}`} className="min-h-touch rounded-xl border border-[var(--color-border)] px-4 py-3 font-bold">Continue to control adapter</a>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">These links carry only receipt identities. They do not select a canonical rig or grant approval.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!ready} onClick={() => void upload()} className="min-h-touch rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{active ? `Retry ${label} upload` : `Upload ${label} rig privately`}</button>
          {active ? <button type="button" disabled={!token.trim()} onClick={() => void abandonOpenSession()} className="min-h-touch rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold disabled:opacity-40">Abandon open version</button> : null}
        </div>
      )}
    </section>
  );
}
