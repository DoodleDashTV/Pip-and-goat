'use client';

import { useMemo, useRef, useState } from 'react';
import { hashFileChunked } from '@/lib/scenery/intake/client-hash';
import { reviewOneTapPurchasedSelection, type OneTapPurchasedReview } from '@/lib/scenery/intake/one-tap';
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
  eligible: boolean;
};

const COLLECTIONS = [
  { id: 'village', name: 'Village Environment', expected: 7 },
  { id: 'sky-hdri', name: 'Sky and HDRI Lighting', expected: 7 },
  { id: 'stylized-forest', name: 'Stylized Forest', expected: 4 },
  { id: 'procedural-nature', name: 'Procedural Nature Library', expected: 9 },
] as const;

function intakeHeaders(token: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token.trim()) headers['x-tivvlejoy-scenery-intake-token'] = token.trim();
  return headers;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SceneryAssetIntake({ snapshot }: { snapshot: PublicScenerySnapshot }) {
  const [rows, setRows] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [collectionId, setCollectionId] = useState<(typeof COLLECTIONS)[number]['id']>('village');
  const [studioToken, setStudioToken] = useState('');
  const [review, setReview] = useState<OneTapPurchasedReview | null>(null);
  const oneTapInputRef = useRef<HTMLInputElement>(null);
  const singleCollectionInputRef = useRef<HTMLInputElement>(null);

  const intake = snapshot.intake;
  const checklist = useMemo(() => intake.expectedInventory, [intake.expectedInventory]);
  const overallProgress = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length)
    : 0;
  const completedCount = rows.filter(
    (row) => row.uploadStatus === 'completed' || row.uploadStatus === 'already_present',
  ).length;

  function updateRow(id: string, patch: Partial<FileRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function applyOneTapSelection(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    const nextReview = reviewOneTapPurchasedSelection(
      selected.map((file) => ({ filename: file.name, byteSize: file.size })),
    );
    const nextRows: FileRow[] = selected.map((file, index) => {
      const classified = nextReview.items[index];
      const matched = classified?.eligible ? classified : null;
      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        file,
        collectionId: matched?.collectionId ?? classified?.collectionId ?? collectionId,
        expectedSourceId: matched?.sourceId ?? '',
        sha256: '',
        hashStatus: 'pending',
        uploadStatus: matched ? 'not_started' : 'refused',
        storageStatus: 'not_verified',
        duplicateStatus: classified?.classification === 'duplicate' ? 'duplicate_selection' : 'unknown',
        quarantineStatus: 'not_quarantined',
        inspectionStatus: 'not_eligible',
        progress: 0,
        multipartProgress: '0 / 0',
        error: matched ? null : classified?.reason ?? 'File refused.',
        sessionId: null,
        eligible: Boolean(matched),
      };
    });
    setReview(nextReview);
    setRows(nextRows);
  }

  function onSelectSingleCollection(files: FileList | null) {
    if (!files?.length) return;
    const next: FileRow[] = [...rows];
    for (const file of Array.from(files)) {
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${next.length}`,
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
        eligible: true,
      });
    }
    setRows(next);
  }

  async function processRow(row: FileRow) {
    if (!row.eligible) return;
    updateRow(row.id, { hashStatus: 'hashing', error: null });
    const hashed = await hashFileChunked(row.file, (offset, total) => {
      updateRow(row.id, { progress: Math.round((offset / total) * 40), hashStatus: 'hashing' });
    });
    updateRow(row.id, { sha256: hashed.sha256, hashStatus: 'recorded', progress: 45 });
    const created = await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: intakeHeaders(studioToken),
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
        headers: intakeHeaders(studioToken),
        body: JSON.stringify({ action: 'sign-part', sessionId: session.sessionId, partNumber: part.partNumber }),
      });
      const signedJson = (await signed.json()) as { signedUrl?: string; error?: string };
      if (!signed.ok || !signedJson.signedUrl) {
        updateRow(row.id, { error: signedJson.error ?? 'Part signing failed.', uploadStatus: 'failed' });
        return;
      }
      if (/vercel\.(app|com)/i.test(signedJson.signedUrl)) {
        updateRow(row.id, { error: 'Signed storage URL must not target Vercel.', uploadStatus: 'failed' });
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
      headers: intakeHeaders(studioToken),
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

  async function uploadEligible() {
    setBusy(true);
    try {
      for (const row of rows.filter(
        (item) => item.eligible && (item.uploadStatus === 'not_started' || item.uploadStatus === 'failed'),
      )) {
        await processRow(row);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resume(row: FileRow) {
    if (!row.sessionId || !row.eligible) return;
    await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: intakeHeaders(studioToken),
      body: JSON.stringify({ action: 'resume', sessionId: row.sessionId }),
    });
    await processRow(row);
  }

  async function cancel(row: FileRow) {
    if (!row.sessionId) return;
    await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: intakeHeaders(studioToken),
      body: JSON.stringify({ action: 'abort', sessionId: row.sessionId }),
    });
    updateRow(row.id, { uploadStatus: 'aborted' });
  }

  const eligibleCount = rows.filter((row) => row.eligible).length;

  return (
    <section className="studio-card space-y-4 p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">{SCENERY_COPY.intakeTitle}</h2>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">{SCENERY_COPY.intakeInstruction}</p>
      <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3 text-sm font-bold">
        {SCENERY_COPY.uploadNotApproval}
      </p>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">{SCENERY_COPY.unauthorizedMutations}</p>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">{SCENERY_COPY.directToStorage}</p>
      <p className="text-sm leading-6">
        {SCENERY_COPY.studioSession}: {intake.authorization.tokenConfigured ? 'token configured' : 'token not configured'} ·
        storage {intake.realAssetReadiness.storageConfiguration}
      </p>
      <label className="block text-sm font-bold">
        {SCENERY_COPY.studioTokenLabel}
        <input
          className="field-input mt-1"
          type="password"
          autoComplete="off"
          value={studioToken}
          onChange={(event) => setStudioToken(event.target.value)}
        />
      </label>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">{SCENERY_COPY.studioTokenHelp}</p>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">{SCENERY_COPY.oneTapNoCollectionRequired}</p>

      <label className="btn-primary block w-full cursor-pointer px-4 text-center text-sm">
        {SCENERY_COPY.oneTapSelectUpload}
        <input
          ref={oneTapInputRef}
          className="sr-only"
          type="file"
          multiple
          onChange={(event) => {
            applyOneTapSelection(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      {review ? (
        <div className="space-y-3 rounded-2xl border border-[var(--color-border)] px-3 py-3">
          <h3 className="font-bold">{SCENERY_COPY.oneTapReviewTitle}</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            {review.selectedCount} selected · {review.matched.length} matched · {review.missing.length} missing ·{' '}
            {review.unexpected.length} unexpected · {review.duplicates.length} duplicate · {review.incorrect.length}{' '}
            incorrect
          </p>
          <div>
            <h4 className="font-bold">{SCENERY_COPY.oneTapMatched}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {review.matched.map((item) => (
                <li key={`${item.sourceId}-${item.filename}`}>
                  {item.collectionName}: {item.filename} · {formatBytes(item.byteSize)} · {item.sourceId}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold">{SCENERY_COPY.oneTapMissing}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {review.missing.map((item) => (
                <li key={item.sourceId}>
                  {item.collectionName}: {item.expectedFilename} · {item.sourceId}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold">{SCENERY_COPY.oneTapUnexpected}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {review.unexpected.length === 0 ? <li>None</li> : null}
              {review.unexpected.map((item, index) => (
                <li key={`unexpected-${item.filename}-${index}`}>
                  {item.filename} · {formatBytes(item.byteSize)} · refused individually
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold">{SCENERY_COPY.oneTapDuplicates}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {review.duplicates.length === 0 ? <li>None</li> : null}
              {review.duplicates.map((item, index) => (
                <li key={`duplicate-${item.filename}-${index}`}>
                  {item.filename} · {formatBytes(item.byteSize)} · refused individually
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold">{SCENERY_COPY.oneTapIncorrect}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {review.incorrect.length === 0 ? <li>None</li> : null}
              {review.incorrect.map((item) => (
                <li key={`incorrect-${item.filename}`}>
                  {item.filename} · expected {item.expectedFilename} · refused individually
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold">{SCENERY_COPY.oneTapCollectionTotals}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {review.collectionTotals.map((item) => (
                <li key={item.collectionId}>
                  {item.collectionName}: {item.matched}/{item.expected} matched · {formatBytes(item.bytes)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

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
        <h3 className="font-bold">Expected 27-file source checklist</h3>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {checklist.length} expected production files across {COLLECTIONS.length} collections
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {checklist.map((item) => (
            <li key={item.sourceId}>
              {item.collectionName}: {item.expectedFilename} · {item.sourceId}
              {item.unityPreservationOnly ? ' · Unity preservation only' : ''}
            </li>
          ))}
        </ul>
      </div>

      <label className="block text-sm font-bold">
        Select one or multiple files
        <input
          ref={singleCollectionInputRef}
          className="field-input mt-1"
          type="file"
          multiple
          onChange={(event) => {
            onSelectSingleCollection(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      {rows.length > 0 ? (
        <p className="text-sm font-bold">
          {SCENERY_COPY.oneTapOverallProgress}: {overallProgress}% · {completedCount}/{eligibleCount || rows.length} eligible
          completed
        </p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-[var(--color-border)] px-3 py-3 text-sm">
            <p className="font-bold">{row.file.name}</p>
            <p className="text-[var(--color-text-muted)]">{row.file.size} bytes</p>
            <p>Collection: {row.collectionId || 'unmapped'}</p>
            <p>Upload progress: {row.progress}%</p>
            <p>Multipart progress: {row.multipartProgress}</p>
            <p>
              SHA-256: {row.hashStatus}
              {row.sha256 ? ` · ${row.sha256.slice(0, 12)}…` : ''}
            </p>
            <p>Storage: {row.storageStatus}</p>
            <p>Duplicate: {row.duplicateStatus}</p>
            <p>Quarantine: {row.quarantineStatus}</p>
            <p>Inspection readiness: {row.inspectionStatus}</p>
            {row.error ? <p className="text-[var(--color-danger-foreground)]">{row.error}</p> : null}
            {row.eligible ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary px-3 py-2" onClick={() => resume(row)}>
                  Resume
                </button>
                <button type="button" className="btn-secondary px-3 py-2" onClick={() => cancel(row)}>
                  Pause / cancel
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn-primary w-full px-4 text-sm sm:w-auto"
        disabled={busy || eligibleCount === 0}
        onClick={uploadEligible}
      >
        {SCENERY_COPY.oneTapUploadEligible}
      </button>
    </section>
  );
}
