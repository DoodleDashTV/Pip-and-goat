'use client';

import { useMemo, useState } from 'react';
import { hashFileChunked } from '@/lib/scenery/intake/client-hash';
import { SCENERY_COPY } from '@/lib/scenery/copy';
import type { PublicScenerySnapshot } from '@/lib/scenery/public';

type FileRow = {
  id: string;
  file: File;
  collectionId: string;
  expectedSourceId: string;
  sha256: string;
  hashStatus: string;
  uploadStatus: string;
  storageStatus: string;
  duplicateStatus: string;
  quarantineStatus: string;
  inspectionStatus: string;
  progress: number;
  multipartProgress: string;
  error: string | null;
  sessionId: string | null;
};

const COLLECTIONS = [
  { id: 'village', name: 'Village Environment', expected: 7 },
  { id: 'sky-hdri', name: 'Sky and HDRI Lighting', expected: 7 },
  { id: 'stylized-forest', name: 'Stylized Forest', expected: 4 },
  { id: 'procedural-nature', name: 'Procedural Nature Library', expected: 9 },
] as const;

export function SceneryAssetIntake({ snapshot }: { snapshot: PublicScenerySnapshot }) {
  const [rows, setRows] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [collectionId, setCollectionId] = useState<(typeof COLLECTIONS)[number]['id']>('village');

  const intake = snapshot.intake;

  const checklist = useMemo(
    () => intake.expectedInventory.filter((item) => item.collectionId === collectionId),
    [collectionId, intake.expectedInventory],
  );

  function updateRow(id: string, patch: Partial<FileRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function onSelect(files: FileList | null) {
    if (!files?.length) return;
    const next: FileRow[] = [...rows];
    for (const file of Array.from(files)) {
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        collectionId,
        expectedSourceId: '',
        sha256: '',
        hashStatus: 'pending',
        uploadStatus: 'not_started',
        storageStatus: 'not_verified',
        duplicateStatus: 'unknown',
        quarantineStatus: 'not_quarantined',
        inspectionStatus: 'not_eligible',
        progress: 0,
        multipartProgress: '0 / 0',
        error: null,
        sessionId: null,
      });
    }
    setRows(next);
  }

  async function processRow(row: FileRow) {
    updateRow(row.id, { hashStatus: 'hashing', error: null });
    const hashed = await hashFileChunked(row.file, (offset, total) => {
      updateRow(row.id, { progress: Math.round((offset / total) * 40), hashStatus: 'hashing' });
    });
    updateRow(row.id, { sha256: hashed.sha256, hashStatus: 'recorded', progress: 45 });
    const created = await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create-session',
        collectionId: row.collectionId,
        filename: row.file.name,
        byteSize: row.file.size,
        mimeType: row.file.type || 'application/octet-stream',
        lastModified: new Date(row.file.lastModified).toISOString(),
        sha256: hashed.sha256,
        expectedSourceId: row.expectedSourceId || undefined,
      }),
    });
    const createdJson = (await created.json()) as {
      error?: string;
      connectionReadyOnly?: boolean;
      alreadyPresent?: boolean;
      session?: {
        sessionId: string;
        parts: Array<{ partNumber: number; start: number; end: number }>;
        expectedSourceId: string;
        state: string;
      };
      manifest?: { quarantineState: string; inspectionState: string };
    };
    if (!created.ok) {
      updateRow(row.id, { error: createdJson.error ?? 'Session refused.', uploadStatus: 'failed' });
      return;
    }
    if (createdJson.alreadyPresent) {
      updateRow(row.id, {
        uploadStatus: 'already_present',
        duplicateStatus: 'already_present',
        storageStatus: 'reused',
        progress: 100,
        sessionId: createdJson.session?.sessionId ?? null,
      });
      return;
    }
    if (createdJson.connectionReadyOnly || !createdJson.session) {
      updateRow(row.id, {
        uploadStatus: 'connection_ready_only',
        storageStatus: 'unavailable',
        progress: 45,
        sessionId: createdJson.session?.sessionId ?? null,
        error: 'Private storage is not configured in this environment. No file bytes were uploaded.',
      });
      return;
    }
    const session = createdJson.session;
    updateRow(row.id, {
      sessionId: session.sessionId,
      expectedSourceId: session.expectedSourceId,
      uploadStatus: 'uploading',
      multipartProgress: `0 / ${session.parts.length}`,
    });
    const completedParts: Array<{ partNumber: number; etag: string }> = [];
    for (const part of session.parts) {
      const signed = await fetch('/api/scenery/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign-part', sessionId: session.sessionId, partNumber: part.partNumber }),
      });
      const signedJson = (await signed.json()) as { signedUrl?: string; error?: string };
      if (!signed.ok || !signedJson.signedUrl) {
        updateRow(row.id, { error: signedJson.error ?? 'Part signing failed.', uploadStatus: 'failed' });
        return;
      }
      const blob = row.file.slice(part.start, part.end);
      const uploaded = await fetch(signedJson.signedUrl, { method: 'PUT', body: blob });
      if (!uploaded.ok) {
        updateRow(row.id, { error: `Part ${part.partNumber} failed.`, uploadStatus: 'failed' });
        return;
      }
      completedParts.push({ partNumber: part.partNumber, etag: uploaded.headers.get('ETag') ?? `"part-${part.partNumber}"` });
      updateRow(row.id, {
        progress: 45 + Math.round((completedParts.length / session.parts.length) * 50),
        multipartProgress: `${completedParts.length} / ${session.parts.length}`,
      });
    }
    const completed = await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete', sessionId: session.sessionId, parts: completedParts }),
    });
    const completedJson = (await completed.json()) as {
      error?: string;
      manifest?: { quarantineState: string; inspectionState: string; verificationState: string };
    };
    if (!completed.ok) {
      updateRow(row.id, { error: completedJson.error ?? 'Complete failed.', uploadStatus: 'failed' });
      return;
    }
    updateRow(row.id, {
      uploadStatus: 'completed',
      storageStatus: completedJson.manifest?.verificationState ?? 'awaiting_verification',
      quarantineStatus: completedJson.manifest?.quarantineState ?? 'not_quarantined',
      inspectionStatus: completedJson.manifest?.inspectionState ?? 'not_eligible',
      progress: 100,
    });
  }

  async function uploadAll() {
    setBusy(true);
    try {
      for (const row of rows.filter((item) => item.uploadStatus === 'not_started' || item.uploadStatus === 'failed')) {
        await processRow(row);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resume(row: FileRow) {
    if (!row.sessionId) return;
    await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume', sessionId: row.sessionId }),
    });
    await processRow(row);
  }

  async function cancel(row: FileRow) {
    if (!row.sessionId) return;
    await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'abort', sessionId: row.sessionId }),
    });
    updateRow(row.id, { uploadStatus: 'aborted' });
  }

  return (
    <section className="studio-card space-y-4 p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">{SCENERY_COPY.intakeTitle}</h2>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">{SCENERY_COPY.intakeInstruction}</p>
      <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3 text-sm font-bold">
        {SCENERY_COPY.uploadNotApproval}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {COLLECTIONS.map((collection) => (
          <button
            key={collection.id}
            type="button"
            className={`rounded-2xl border px-3 py-3 text-left ${
              collectionId === collection.id
                ? 'border-[var(--color-primary)] bg-[var(--color-surface-subtle)]'
                : 'border-[var(--color-border)]'
            }`}
            onClick={() => setCollectionId(collection.id)}
          >
            <p className="font-bold">{collection.name}</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{collection.expected} expected production files</p>
          </button>
        ))}
      </div>

      <div>
        <h3 className="font-bold">Expected file checklist</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {checklist.map((item) => (
            <li key={item.sourceId}>
              {item.expectedFilename} · {item.sourceId}
              {item.unityPreservationOnly ? ' · Unity preservation only' : ''}
            </li>
          ))}
        </ul>
      </div>

      <label className="block text-sm font-bold">
        Select one or multiple files
        <input
          className="field-input mt-1"
          type="file"
          multiple
          onChange={(event) => onSelect(event.target.files)}
        />
      </label>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-[var(--color-border)] px-3 py-3 text-sm">
            <p className="font-bold">{row.file.name}</p>
            <p className="text-[var(--color-text-muted)]">{row.file.size} bytes</p>
            <p>Upload progress: {row.progress}%</p>
            <p>Multipart progress: {row.multipartProgress}</p>
            <p>SHA-256: {row.hashStatus}{row.sha256 ? ` · ${row.sha256.slice(0, 12)}…` : ''}</p>
            <p>Storage: {row.storageStatus}</p>
            <p>Duplicate: {row.duplicateStatus}</p>
            <p>Quarantine: {row.quarantineStatus}</p>
            <p>Inspection readiness: {row.inspectionStatus}</p>
            {row.error ? <p className="text-[var(--color-danger-foreground)]">{row.error}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary px-3 py-2" onClick={() => resume(row)}>
                Resume
              </button>
              <button type="button" className="btn-secondary px-3 py-2" onClick={() => cancel(row)}>
                Pause / cancel
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button type="button" className="btn-primary w-full px-4 text-sm sm:w-auto" disabled={busy || rows.length === 0} onClick={uploadAll}>
        Start or retry direct upload
      </button>
    </section>
  );
}
