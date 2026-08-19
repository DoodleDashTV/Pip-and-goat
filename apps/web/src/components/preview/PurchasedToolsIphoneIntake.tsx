'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hashFileChunked } from '@/lib/scenery/intake/client-hash';
import {
  findPurchasedToolPackageByFilename,
  PURCHASED_TOOL_PACKAGES,
  type PurchasedToolPackage,
} from '@/lib/purchased-tools/catalog';

const RECOVERY_KEY = 'tivvlejoy-purchased-tool-upload-recovery-v1';

type PublicPart = { partNumber: number; start: number; end: number; completed: boolean };
type PublicSession = {
  sessionId: string;
  sourceId: string;
  filename: string;
  byteSize: number;
  state: string;
  clientSha256Recorded: boolean;
  expiresAt: string;
  partCount: number;
  parts: PublicPart[];
};

type RecoveryRecord = {
  sessionId: string;
  sourceId: string;
  filename: string;
  byteSize: number;
  lastModified: number;
  updatedAt: string;
};

function headers(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-tivvlejoy-scenery-intake-token': token.trim(),
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} bytes`;
}

function loadRecovery(): RecoveryRecord[] {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecoveryRecord[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecovery(record: RecoveryRecord) {
  const rest = loadRecovery().filter((item) => item.sessionId !== record.sessionId);
  localStorage.setItem(RECOVERY_KEY, JSON.stringify([record, ...rest].slice(0, 12)));
}

function removeRecovery(sessionId: string) {
  localStorage.setItem(
    RECOVERY_KEY,
    JSON.stringify(loadRecovery().filter((item) => item.sessionId !== sessionId)),
  );
}

async function api<T>(token: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/purchased-tools/intake', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok || json.error) throw new Error(json.error ?? 'Purchased asset intake failed.');
  return json;
}

async function requestScreenWakeLock() {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    return nav.wakeLock ? await nav.wakeLock.request('screen') : null;
  } catch {
    return null;
  }
}

export function PurchasedToolsIphoneIntake() {
  const [token, setToken] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pkg, setPkg] = useState<PurchasedToolPackage | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [status, setStatus] = useState('Select one original purchased file from the iPhone Files app.');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hashProgress, setHashProgress] = useState(0);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const pauseRequested = useRef(false);

  useEffect(() => {
    setRecoveryCount(loadRecovery().length);
  }, []);

  const completedParts = useMemo(
    () => session?.parts.filter((part) => part.completed).length ?? 0,
    [session],
  );

  function selectFile(next: File | null) {
    setError(null);
    setSession(null);
    setProgress(0);
    setHashProgress(0);
    if (!next) {
      setFile(null);
      setPkg(null);
      return;
    }
    const matched = findPurchasedToolPackageByFilename(next.name);
    setFile(next);
    setPkg(matched);
    if (!matched) {
      setStatus('This filename is not in the approved purchased-tools catalog. Do not rename the download.');
      return;
    }
    const recovered = loadRecovery().find(
      (item) =>
        item.sourceId === matched.sourceId &&
        item.filename === next.name &&
        item.byteSize === next.size &&
        item.lastModified === next.lastModified,
    );
    if (recovered) {
      setSession({
        sessionId: recovered.sessionId,
        sourceId: recovered.sourceId,
        filename: recovered.filename,
        byteSize: recovered.byteSize,
        state: 'recoverable',
        clientSha256Recorded: false,
        expiresAt: '',
        partCount: 0,
        parts: [],
      });
      setStatus('A recoverable upload session matches this exact file. Tap Resume upload.');
    } else {
      setStatus(`${matched.displayName} ${matched.version} matched. Ready to upload privately.`);
    }
  }

  async function createOrResume(): Promise<PublicSession> {
    if (!file || !pkg) throw new Error('Select an approved original download first.');
    if (!token.trim()) throw new Error('Enter the TivvleJoy Preview studio upload token.');
    if (session?.sessionId) {
      const resumed = await api<{ session: PublicSession }>(token, {
        action: 'resume',
        sessionId: session.sessionId,
      });
      setSession(resumed.session);
      return resumed.session;
    }
    const created = await api<{ session: PublicSession; alreadyStored?: boolean }>(token, {
      action: 'create',
      sourceId: pkg.sourceId,
      filename: file.name,
      byteSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      lastModified: new Date(file.lastModified).toISOString(),
    });
    setSession(created.session);
    saveRecovery({
      sessionId: created.session.sessionId,
      sourceId: pkg.sourceId,
      filename: file.name,
      byteSize: file.size,
      lastModified: file.lastModified,
      updatedAt: new Date().toISOString(),
    });
    setRecoveryCount(loadRecovery().length);
    return created.session;
  }

  async function refreshSession(sessionId: string): Promise<PublicSession> {
    const refreshed = await api<{ session: PublicSession }>(token, {
      action: 'status',
      sessionId,
    });
    setSession(refreshed.session);
    return refreshed.session;
  }

  async function upload() {
    if (!file || !pkg) {
      setError('Select an approved purchased file first.');
      return;
    }
    setBusy(true);
    setError(null);
    pauseRequested.current = false;
    const wakeLock = await requestScreenWakeLock();
    try {
      let current = await createOrResume();
      if (current.state === 'completed') {
        setProgress(100);
        setStatus('This file is already stored privately. Verifying checksum…');
        if (!current.clientSha256Recorded) await verifyHash(current.sessionId);
        return;
      }
      const totalParts = current.parts.length;
      for (const part of current.parts) {
        if (pauseRequested.current) {
          setStatus('Paused safely between chunks. Re-select the same file later and tap Resume upload.');
          return;
        }
        if (part.completed) continue;
        setStatus(`Uploading ${pkg.displayName}: part ${part.partNumber} of ${totalParts}. Keep Safari open.`);
        let uploaded = false;
        let lastMessage = 'Chunk upload failed.';
        for (let attempt = 1; attempt <= 3 && !uploaded; attempt += 1) {
          try {
            const signed = await api<{
              signedUrl: string | null;
              alreadyCompleted: boolean;
            }>(token, {
              action: 'sign-part',
              sessionId: current.sessionId,
              partNumber: part.partNumber,
            });
            if (signed.alreadyCompleted) {
              uploaded = true;
              break;
            }
            if (!signed.signedUrl || /vercel\.(app|com)/i.test(signed.signedUrl)) {
              throw new Error('Private storage did not return a safe signed R2 URL.');
            }
            const blob = file.slice(part.start, part.end);
            const put = await fetch(signed.signedUrl, { method: 'PUT', body: blob });
            if (!put.ok) throw new Error(`Private R2 returned HTTP ${put.status}.`);
            const etag = put.headers.get('etag');
            if (!etag) throw new Error('Private R2 did not expose the multipart ETag.');
            const recorded = await api<{ session: PublicSession }>(token, {
              action: 'record-part',
              sessionId: current.sessionId,
              partNumber: part.partNumber,
              etag,
            });
            current = recorded.session;
            setSession(current);
            uploaded = true;
          } catch (caught) {
            lastMessage = caught instanceof Error ? caught.message : lastMessage;
            if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 1000 * 2 ** attempt));
          }
        }
        if (!uploaded) throw new Error(`${lastMessage} Your completed chunks are saved; use Resume upload.`);
        const done = current.parts.filter((item) => item.completed).length;
        setProgress(Math.round((done / Math.max(1, totalParts)) * 95));
        saveRecovery({
          sessionId: current.sessionId,
          sourceId: pkg.sourceId,
          filename: file.name,
          byteSize: file.size,
          lastModified: file.lastModified,
          updatedAt: new Date().toISOString(),
        });
      }
      current = await refreshSession(current.sessionId);
      if (current.parts.some((part) => !part.completed)) {
        setStatus('Some chunks are still pending. Tap Resume upload.');
        return;
      }
      setStatus('All chunks reached private R2. Finalizing the multipart object…');
      const completed = await api<{ session: PublicSession; storedSize: number }>(token, {
        action: 'complete',
        sessionId: current.sessionId,
      });
      current = completed.session;
      setSession(current);
      setProgress(100);
      setStatus(`Stored ${formatBytes(completed.storedSize)} privately. Computing SHA-256 on your iPhone…`);
      await verifyHash(current.sessionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.');
    } finally {
      setBusy(false);
      try {
        await wakeLock?.release();
      } catch {
        // no-op
      }
    }
  }

  async function verifyHash(sessionId = session?.sessionId) {
    if (!file || !sessionId) throw new Error('Re-select the exact source file before checksum verification.');
    setError(null);
    setHashProgress(0);
    setStatus('Computing SHA-256 locally. Keep Safari open until verification finishes.');
    const hashed = await hashFileChunked(file, (offset, total) => {
      setHashProgress(total > 0 ? Math.round((offset / total) * 100) : 0);
    });
    const recorded = await api<{ session: PublicSession }>(token, {
      action: 'record-hash',
      sessionId,
      sha256: hashed.sha256,
    });
    setSession(recorded.session);
    removeRecovery(sessionId);
    setRecoveryCount(loadRecovery().length);
    setHashProgress(100);
    setStatus('Upload complete: private R2 size verified and client SHA-256 receipt recorded. Raw source remains immutable.');
  }

  function pause() {
    pauseRequested.current = true;
    setStatus('Pause requested. The current chunk will finish, then the upload will stop safely.');
  }

  async function cancel() {
    if (!session?.sessionId || !token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(token, { action: 'abort', sessionId: session.sessionId });
      removeRecovery(session.sessionId);
      setRecoveryCount(loadRecovery().length);
      setSession(null);
      setProgress(0);
      setStatus('Multipart upload aborted. Completed production/library objects are never deleted by this action.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Cancel failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Preview only · private R2</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">Purchased Assets — iPhone Upload</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          Built for the large Botaniq package, selected Blender tools, and purchased scenery sources. Files travel directly from Safari to signed private R2 multipart URLs. They are never committed to GitHub.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/purchased-assets/audit" className="font-bold underline">
            Open asset library audit
          </Link>
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-sm leading-6">
        <strong>For large files:</strong> keep Safari in the foreground and keep the iPhone awake. If iOS interrupts the upload, completed 32 MB chunks remain recorded for up to 72 hours; re-select the exact same file and resume.
      </div>

      <label className="block text-sm font-bold">
        TivvleJoy Preview studio upload token
        <input
          className="field-input mt-1 min-h-11 w-full"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>

      <label className="block text-sm font-bold">
        Select original purchased file
        <input
          className="field-input mt-1 min-h-11 w-full"
          type="file"
          accept=".paq,.zip,.blend,.fbx,.glb"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
      </label>

      <div className="rounded-2xl border border-[var(--color-border)] p-3 text-sm">
        <p className="font-bold">Approved intake filenames</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {PURCHASED_TOOL_PACKAGES.map((item) => (
            <li key={item.sourceId}>
              {item.displayName}: <code>{item.expectedFilename}</code> · {item.activation}
            </li>
          ))}
        </ul>
      </div>

      {file ? (
        <div className="rounded-2xl border border-[var(--color-border)] p-3 text-sm leading-6">
          <p className="font-bold">{file.name}</p>
          <p>{formatBytes(file.size)}</p>
          <p>Catalog match: {pkg ? `${pkg.displayName} ${pkg.version}` : 'REFUSED'}</p>
          {session?.sessionId ? <p>Resume session: present · expires {session.expiresAt || 'after server restore'}</p> : null}
          {session?.partCount ? <p>Chunks: {completedParts}/{session.partCount} recorded</p> : null}
          <p>Upload progress: {progress}%</p>
          {hashProgress > 0 ? <p>SHA-256 progress: {hashProgress}%</p> : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-[var(--color-border)] p-3 text-sm" role="status" aria-live="polite">
        {status}
        {recoveryCount ? <p className="mt-1">Recoverable sessions on this iPhone: {recoveryCount}</p> : null}
        {error ? <p className="mt-2 font-bold text-[var(--color-danger-foreground)]">{error}</p> : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button className="btn-primary min-h-12 px-4" type="button" disabled={busy || !pkg || !file} onClick={upload}>
          {session?.sessionId ? 'Resume upload' : 'Start private upload'}
        </button>
        <button className="btn-secondary min-h-12 px-4" type="button" disabled={!busy} onClick={pause}>
          Pause safely
        </button>
        <button
          className="btn-secondary min-h-12 px-4"
          type="button"
          disabled={busy || !file || !session?.sessionId || session.clientSha256Recorded}
          onClick={() => verifyHash().catch((caught) => setError(caught instanceof Error ? caught.message : 'Checksum failed.'))}
        >
          Verify SHA-256
        </button>
        <button className="btn-secondary min-h-12 px-4" type="button" disabled={busy || !session?.sessionId} onClick={cancel}>
          Cancel unfinished upload
        </button>
      </div>

      <p className="text-xs leading-5 text-[var(--color-text-muted)]">
        Upload does not mean asset approval or plugin activation. New mountain and tavern sources remain STORE_ONLY until provenance and controlled inspection complete. Botaniq stays source-immutable; Geo-Scatter remains optional/not integrated; Gaffer and Physical Starlight remain install-later candidates until controlled Blender validation.
      </p>
    </section>
  );
}
