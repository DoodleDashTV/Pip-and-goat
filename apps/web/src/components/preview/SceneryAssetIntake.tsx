'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { hashFileChunked } from '@/lib/scenery/intake/client-hash';
import {
  SceneryPartTransferError,
  uploadRetryDelayMs,
  uploadSignedPart,
} from '@/lib/scenery/intake/client-transfer';
import {
  loadClientRecoverySnapshots,
  matchClientRecoverySnapshot,
  removeClientRecoverySnapshot,
  saveClientRecoverySnapshot,
} from '@/lib/scenery/intake/client-recovery';
import {
  runWithBoundedConcurrency,
  SCENERY_INTAKE_MAX_CONCURRENT_FILES,
} from '@/lib/scenery/intake/concurrency';
import {
  announceIntakeState,
  INTAKE_LAYOUT,
  recoveredStateLabel,
} from '@/lib/scenery/intake/intake-ux';
import {
  reviewOneTapPurchasedSelection,
  type OneTapPurchasedReview,
} from '@/lib/scenery/intake/one-tap';
import {
  classifyRecoveredState,
  partsStillNeeded,
  type RecoveredUploadState,
} from '@/lib/scenery/intake/recovery';
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
  quarantineReason: string;
  inspectionStatus: string;
  recoveredState: RecoveredUploadState;
  progress: number;
  multipartProgress: string;
  transferredBytes: number;
  storedBytes: number;
  error: string | null;
  sessionId: string | null;
  eligible: boolean;
  uploadedPartNumbers: number[];
  partCount: number;
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

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function emptyRow(file: File, index: number, extras: Partial<FileRow> = {}): FileRow {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
    file,
    collectionId: '',
    expectedSourceId: '',
    sha256: '',
    hashStatus: 'pending',
    uploadStatus: 'not_started',
    storageStatus: 'not_verified',
    duplicateStatus: 'unknown',
    quarantineStatus: 'not_quarantined',
    quarantineReason: '',
    inspectionStatus: 'not_eligible',
    recoveredState: 'unknown',
    progress: 0,
    multipartProgress: '0 / 0',
    transferredBytes: 0,
    storedBytes: 0,
    error: null,
    sessionId: null,
    eligible: true,
    uploadedPartNumbers: [],
    partCount: 0,
    ...extras,
  };
}

export function SceneryAssetIntake({ snapshot }: { snapshot: PublicScenerySnapshot }) {
  const [rows, setRows] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [collectionId, setCollectionId] = useState<(typeof COLLECTIONS)[number]['id']>('village');
  const [studioToken, setStudioToken] = useState('');
  const [review, setReview] = useState<OneTapPurchasedReview | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState(
    'Ready to select purchased scenery files.',
  );
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const oneTapInputRef = useRef<HTMLInputElement>(null);
  const singleCollectionInputRef = useRef<HTMLInputElement>(null);
  const pauseRequested = useRef(new Set<string>());

  const intake = snapshot.intake;
  const checklist = useMemo(() => intake.expectedInventory, [intake.expectedInventory]);
  const overallProgress = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length)
    : 0;
  const completedCount = rows.filter(
    (row) => row.uploadStatus === 'completed' || row.uploadStatus === 'already_present',
  ).length;
  const transferredTotal = rows.reduce((sum, row) => sum + row.transferredBytes, 0);
  const storedTotal = rows.reduce((sum, row) => sum + row.storedBytes, 0);

  useEffect(() => {
    const snapshots = loadClientRecoverySnapshots();
    if (snapshots.length > 0) {
      setRecoveryNotice(
        `${snapshots.length} recoverable upload session${snapshots.length === 1 ? '' : 's'} found. ${SCENERY_COPY.oneTapRefreshHelp}`,
      );
    }
  }, []);

  function updateRow(id: string, patch: Partial<FileRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function announce(message: string) {
    setLiveAnnouncement(message);
  }

  function applyOneTapSelection(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    const nextReview = reviewOneTapPurchasedSelection(
      selected.map((file) => ({ filename: file.name, byteSize: file.size })),
    );
    const recovered = loadClientRecoverySnapshots();
    const nextRows: FileRow[] = selected.map((file, index) => {
      const classified = nextReview.items[index];
      const matched = classified?.eligible ? classified : null;
      const snapshotMatch = matchClientRecoverySnapshot(recovered, file);
      return emptyRow(file, index, {
        collectionId: matched?.collectionId ?? classified?.collectionId ?? collectionId,
        expectedSourceId: matched?.sourceId ?? snapshotMatch?.sourceId ?? '',
        sha256: snapshotMatch?.sha256 ?? '',
        uploadStatus: matched ? (snapshotMatch?.status ?? 'not_started') : 'refused',
        recoveredState: snapshotMatch
          ? classifyRecoveredState({
              session: {
                state: snapshotMatch.status,
                createdAt: snapshotMatch.updatedAt,
                updatedAt: snapshotMatch.updatedAt,
              },
            })
          : 'unknown',
        sessionId: snapshotMatch?.sessionId ?? null,
        uploadedPartNumbers: snapshotMatch?.uploadedPartNumbers ?? [],
        transferredBytes: snapshotMatch?.transferredBytes ?? 0,
        storedBytes: snapshotMatch?.storedBytes ?? 0,
        error: matched ? null : (classified?.reason ?? 'File refused.'),
        eligible: Boolean(matched),
      });
    });
    setReview(nextReview);
    setRows(nextRows);
    announce(
      announceIntakeState({
        state: `${nextReview.eligible.length} eligible, ${nextReview.overallTotals.refused} refused`,
      }),
    );
  }

  function onSelectSingleCollection(files: FileList | null) {
    if (!files?.length) return;
    const next: FileRow[] = [...rows];
    for (const file of Array.from(files)) {
      next.push(emptyRow(file, next.length, { collectionId }));
    }
    setRows(next);
  }

  async function persistRowRecovery(row: FileRow, extras: Partial<FileRow> = {}) {
    const next = { ...row, ...extras };
    if (!next.sessionId) return;
    saveClientRecoverySnapshot({
      sessionId: next.sessionId,
      sourceId: next.expectedSourceId,
      collectionId: next.collectionId,
      filename: next.file.name,
      byteSize: next.file.size,
      sha256: next.sha256 || undefined,
      uploadedPartNumbers: next.uploadedPartNumbers,
      lastPartNumber: next.uploadedPartNumbers.at(-1) ?? 0,
      transferredBytes: next.transferredBytes,
      storedBytes: next.storedBytes || null,
      updatedAt: new Date().toISOString(),
      status:
        next.uploadStatus === 'completed'
          ? 'completed'
          : next.uploadStatus === 'aborted'
            ? 'aborted'
            : next.uploadStatus === 'paused'
              ? 'paused'
              : 'uploading',
    });
  }

  async function processRow(row: FileRow, retryFailedOnly = false) {
    if (!row.eligible) return;
    if (pauseRequested.current.has(row.id)) {
      updateRow(row.id, { uploadStatus: 'paused', recoveredState: 'paused' });
      return;
    }
    updateRow(row.id, {
      hashStatus: row.sha256 ? 'recorded' : 'hashing',
      error: null,
      recoveredState: 'retryable',
    });
    const hashed = row.sha256
      ? { sha256: row.sha256, byteSize: row.file.size }
      : await hashFileChunked(row.file, (offset, total) => {
          updateRow(row.id, { progress: Math.round((offset / total) * 40), hashStatus: 'hashing' });
        });
    updateRow(row.id, {
      sha256: hashed.sha256,
      hashStatus: 'recorded',
      progress: Math.max(row.progress, 45),
    });
    let sessionId = row.sessionId;
    let parts: Array<{ partNumber: number; start: number; end: number }> = [];
    if (!sessionId) {
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
      };
      if (!created.ok) {
        updateRow(row.id, {
          error: createdJson.error ?? 'Session refused.',
          uploadStatus: 'failed',
          recoveredState: 'failed',
        });
        announce(announceIntakeState({ filename: row.file.name, state: 'failed' }));
        return;
      }
      if (createdJson.alreadyPresent) {
        updateRow(row.id, {
          uploadStatus: 'already_present',
          duplicateStatus: 'already_present',
          storageStatus: 'reused',
          recoveredState: 'duplicate',
          progress: 100,
          storedBytes: row.file.size,
          sessionId: createdJson.session?.sessionId ?? null,
        });
        announce(announceIntakeState({ filename: row.file.name, state: 'duplicate' }));
        return;
      }
      if (createdJson.connectionReadyOnly || !createdJson.session) {
        updateRow(row.id, {
          uploadStatus: 'connection_ready_only',
          storageStatus: 'unavailable',
          progress: 45,
          sessionId: createdJson.session?.sessionId ?? null,
          error:
            'Private storage is not configured in this environment. No file bytes were uploaded.',
        });
        return;
      }
      sessionId = createdJson.session.sessionId;
      parts = createdJson.session.parts;
      updateRow(row.id, {
        sessionId,
        expectedSourceId: createdJson.session.expectedSourceId,
        uploadStatus: 'uploading',
        partCount: parts.length,
        multipartProgress: `0 / ${parts.length}`,
      });
    } else {
      const queried = await fetch('/api/scenery/intake', {
        method: 'POST',
        headers: intakeHeaders(studioToken),
        body: JSON.stringify({ action: 'resume', sessionId }),
      });
      const queriedJson = (await queried.json()) as {
        error?: string;
        session?: { parts: Array<{ partNumber: number; start: number; end: number }> };
      };
      if (!queried.ok) {
        updateRow(row.id, {
          error: queriedJson.error ?? 'Resume failed.',
          uploadStatus: 'failed',
          recoveredState: 'expired',
        });
        return;
      }
      parts = queriedJson.session?.parts ?? [];
    }

    const completedParts: Array<{ partNumber: number; etag: string }> = [];
    const needed = retryFailedOnly
      ? partsStillNeeded({ partCount: parts.length, uploadedPartNumbers: row.uploadedPartNumbers })
      : parts.map((part) => part.partNumber);
    const uploaded = [...row.uploadedPartNumbers];
    let transferred = row.transferredBytes;
    for (const part of parts) {
      if (pauseRequested.current.has(row.id)) {
        const paused = {
          uploadStatus: 'paused',
          recoveredState: 'paused' as const,
          uploadedPartNumbers: uploaded,
          transferredBytes: transferred,
        };
        updateRow(row.id, paused);
        await persistRowRecovery(row, paused);
        announce(announceIntakeState({ filename: row.file.name, state: 'paused' }));
        return;
      }
      if (!needed.includes(part.partNumber) && uploaded.includes(part.partNumber)) {
        continue;
      }
      const blob = row.file.slice(part.start, part.end);
      let uploadedEtag = '';
      let lastError = `Part ${part.partNumber} failed.`;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const signed = await fetch('/api/scenery/intake', {
          method: 'POST',
          headers: intakeHeaders(studioToken),
          body: JSON.stringify({
            action: attempt > 1 || retryFailedOnly ? 'retry-part' : 'sign-part',
            sessionId,
            partNumber: part.partNumber,
          }),
        });
        const signedJson = (await signed.json()) as { signedUrl?: string; error?: string };
        if (!signed.ok || !signedJson.signedUrl) {
          lastError = signedJson.error ?? `Part ${part.partNumber} signing failed.`;
          if ((signed.status === 429 || signed.status >= 500) && attempt < 3) {
            updateRow(row.id, { error: `${lastError} Retrying…` });
            await wait(uploadRetryDelayMs(attempt));
            continue;
          }
          break;
        }
        if (/vercel\.(app|com)/i.test(signedJson.signedUrl)) {
          lastError = 'Signed storage URL must not target Vercel.';
          break;
        }
        try {
          const result = await uploadSignedPart(signedJson.signedUrl, blob, (loaded, total) => {
            const currentPartFraction = total > 0 ? loaded / total : 0;
            updateRow(row.id, {
              progress:
                45 + Math.round(((uploaded.length + currentPartFraction) / parts.length) * 50),
              multipartProgress: `${uploaded.length} / ${parts.length} parts (${Math.round(currentPartFraction * 100)}% of current part)`,
            });
          });
          uploadedEtag = result.etag;
          lastError = '';
          break;
        } catch (error) {
          const transferError =
            error instanceof SceneryPartTransferError
              ? error
              : new SceneryPartTransferError(
                  'The browser lost its connection to private storage.',
                  'cors_or_network',
                  true,
                );
          lastError = transferError.message;
          if (!transferError.retryable || attempt === 3) break;
          updateRow(row.id, { error: `${lastError} Retrying part ${part.partNumber}…` });
          await wait(uploadRetryDelayMs(attempt));
        }
      }
      if (!uploadedEtag) {
        const failed = {
          error: lastError,
          uploadStatus: 'failed',
          recoveredState: 'failed' as const,
          uploadedPartNumbers: uploaded,
        };
        updateRow(row.id, failed);
        await persistRowRecovery(row, failed);
        announce(announceIntakeState({ filename: row.file.name, state: 'failed' }));
        return;
      }
      completedParts.push({
        partNumber: part.partNumber,
        etag: uploadedEtag,
      });
      uploaded.push(part.partNumber);
      transferred += blob.size;
      const progressPatch = {
        progress: 45 + Math.round((uploaded.length / parts.length) * 50),
        multipartProgress: `${uploaded.length} / ${parts.length}`,
        transferredBytes: transferred,
        uploadedPartNumbers: [...uploaded],
        sessionId,
        partCount: parts.length,
      };
      updateRow(row.id, progressPatch);
      await persistRowRecovery(row, progressPatch);
    }

    const completed = await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: intakeHeaders(studioToken),
      body: JSON.stringify({ action: 'complete', sessionId, parts: completedParts }),
    });
    const completedJson = (await completed.json()) as {
      error?: string;
      storedSize?: number;
      alreadyCompleted?: boolean;
      manifest?: {
        quarantineState: string;
        inspectionState: string;
        verificationState: string;
        notes?: string[];
      };
    };
    if (!completed.ok) {
      updateRow(row.id, {
        error: completedJson.error ?? 'Complete failed.',
        uploadStatus: 'failed',
        recoveredState: 'failed',
      });
      announce(announceIntakeState({ filename: row.file.name, state: 'failed' }));
      return;
    }
    const inspectionReady = completedJson.manifest?.inspectionState === 'inspection_ready';
    const quarantined = completedJson.manifest?.quarantineState === 'quarantined';
    const done = {
      uploadStatus: 'completed',
      storageStatus: completedJson.manifest?.verificationState ?? 'awaiting_verification',
      quarantineStatus: completedJson.manifest?.quarantineState ?? 'not_quarantined',
      quarantineReason: quarantined
        ? (completedJson.manifest?.notes?.at(-1) ?? 'Quarantined after verification.')
        : '',
      inspectionStatus: completedJson.manifest?.inspectionState ?? 'not_eligible',
      recoveredState: (inspectionReady
        ? 'inspection_ready'
        : quarantined
          ? 'quarantined'
          : 'stored') as RecoveredUploadState,
      storedBytes: completedJson.storedSize ?? row.file.size,
      progress: 100,
      sessionId,
    };
    updateRow(row.id, done);
    await persistRowRecovery(row, done);
    if (sessionId) removeClientRecoverySnapshot(sessionId);
    announce(
      announceIntakeState({ filename: row.file.name, state: done.recoveredState, progress: 100 }),
    );
  }

  async function uploadEligible() {
    setBusy(true);
    pauseRequested.current.clear();
    try {
      const eligible = rows.filter(
        (item) =>
          item.eligible &&
          (item.uploadStatus === 'not_started' ||
            item.uploadStatus === 'failed' ||
            item.uploadStatus === 'paused'),
      );
      await runWithBoundedConcurrency(
        eligible,
        SCENERY_INTAKE_MAX_CONCURRENT_FILES,
        async (row) => {
          await processRow(row, row.uploadStatus === 'failed');
        },
      );
    } finally {
      setBusy(false);
    }
  }

  async function resume(row: FileRow) {
    if (!row.eligible) return;
    pauseRequested.current.delete(row.id);
    await processRow(row, row.uploadedPartNumbers.length > 0);
  }

  async function pause(row: FileRow) {
    pauseRequested.current.add(row.id);
    if (row.sessionId) {
      await fetch('/api/scenery/intake', {
        method: 'POST',
        headers: intakeHeaders(studioToken),
        body: JSON.stringify({ action: 'pause', sessionId: row.sessionId }),
      });
    }
    updateRow(row.id, { uploadStatus: 'paused', recoveredState: 'paused' });
    announce(announceIntakeState({ filename: row.file.name, state: 'paused' }));
  }

  async function cancel(row: FileRow) {
    if (!row.sessionId) {
      updateRow(row.id, { uploadStatus: 'aborted', recoveredState: 'cancelled' });
      return;
    }
    await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: intakeHeaders(studioToken),
      body: JSON.stringify({ action: 'abort', sessionId: row.sessionId }),
    });
    await fetch('/api/scenery/intake', {
      method: 'POST',
      headers: intakeHeaders(studioToken),
      body: JSON.stringify({ action: 'abort', sessionId: row.sessionId }),
    });
    removeClientRecoverySnapshot(row.sessionId);
    updateRow(row.id, { uploadStatus: 'aborted', recoveredState: 'cancelled' });
    announce(announceIntakeState({ filename: row.file.name, state: 'cancelled' }));
  }

  const eligibleCount = rows.filter((row) => row.eligible).length;

  return (
    <section className={INTAKE_LAYOUT.section}>
      <h2 className="font-display text-xl font-semibold">{SCENERY_COPY.intakeTitle}</h2>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">
        {SCENERY_COPY.intakeInstruction}
      </p>
      <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3 text-sm font-bold">
        {SCENERY_COPY.uploadNotApproval}
      </p>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">
        {SCENERY_COPY.unauthorizedMutations}
      </p>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">
        {SCENERY_COPY.directToStorage}
      </p>
      <p className="text-sm leading-6">
        {SCENERY_COPY.studioSession}:{' '}
        {intake.authorization.tokenConfigured ? 'token configured' : 'token not configured'} ·
        storage {intake.realAssetReadiness.storageConfiguration}
      </p>
      <label className="block text-sm font-bold" htmlFor="tivvlejoy-scenery-intake-token">
        {SCENERY_COPY.studioTokenLabel}
        <input
          id="tivvlejoy-scenery-intake-token"
          className="field-input mt-1 min-h-11 w-full"
          type="password"
          autoComplete="off"
          value={studioToken}
          onChange={(event) => setStudioToken(event.target.value)}
        />
      </label>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">
        {SCENERY_COPY.studioTokenHelp}
      </p>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">
        {SCENERY_COPY.oneTapNoCollectionRequired}
      </p>
      <div className="rounded-2xl border border-[var(--color-border)] px-3 py-3" role="note">
        <h3 className="font-bold">{SCENERY_COPY.oneTapRecoveryTitle}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          {SCENERY_COPY.oneTapRefreshHelp}
        </p>
        {recoveryNotice ? <p className="mt-2 text-sm">{recoveryNotice}</p> : null}
      </div>

      <label className={INTAKE_LAYOUT.primaryControl}>
        {SCENERY_COPY.oneTapSelectUpload}
        <input
          ref={oneTapInputRef}
          className="sr-only"
          type="file"
          multiple
          aria-label={SCENERY_COPY.oneTapSelectUpload}
          onChange={(event) => {
            applyOneTapSelection(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {SCENERY_COPY.oneTapLiveStatus}: {liveAnnouncement}
      </div>

      {review ? (
        <div className="space-y-3 rounded-2xl border border-[var(--color-border)] px-3 py-3">
          <h3 className="font-bold">{SCENERY_COPY.oneTapReviewTitle}</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            {review.overallTotals.selected} selected · {review.overallTotals.matched} matched ·{' '}
            {review.overallTotals.missing} missing · {review.overallTotals.unexpected} unexpected ·{' '}
            {review.overallTotals.duplicates} duplicate · {review.overallTotals.incorrect} incorrect
            · {review.overallTotals.eligible} eligible
          </p>
          <div>
            <h4 className="font-bold">{SCENERY_COPY.oneTapMatched}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {review.matched.map((item) => (
                <li key={`${item.sourceId}-${item.filename}`}>
                  {item.collectionName}: {item.filename} · {formatBytes(item.byteSize)} ·{' '}
                  {item.sourceId}
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
                  {item.filename} · expected {item.expectedFilename ?? 'exact inventory name'} ·
                  refused individually
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold">{SCENERY_COPY.oneTapCollectionTotals}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {review.collectionTotals.map((item) => (
                <li key={item.collectionId}>
                  {item.collectionName}: {item.matched}/{item.expected} matched ·{' '}
                  {formatBytes(item.bytes)}
                </li>
              ))}
              <li>
                Overall: {review.overallTotals.matched}/{review.overallTotals.expected} matched ·{' '}
                {formatBytes(review.overallTotals.totalMatchedBytes)}
              </li>
            </ul>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {COLLECTIONS.map((collection) => (
          <button
            key={collection.id}
            type="button"
            aria-pressed={collectionId === collection.id}
            className={`rounded-2xl border px-3 py-3 text-left min-h-11 ${
              collectionId === collection.id
                ? 'border-[var(--color-primary)] bg-[var(--color-surface-subtle)]'
                : 'border-[var(--color-border)]'
            }`}
            onClick={() => setCollectionId(collection.id)}
          >
            <p className="font-bold">{collection.name}</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {collection.expected} expected production files
              {collectionId === collection.id ? ' · selected' : ''}
            </p>
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

      <label className="block text-sm font-bold" htmlFor="tivvlejoy-scenery-single-collection">
        Select one or multiple files
        <input
          id="tivvlejoy-scenery-single-collection"
          ref={singleCollectionInputRef}
          className="field-input mt-1 min-h-11 w-full"
          type="file"
          multiple
          onChange={(event) => {
            onSelectSingleCollection(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      {rows.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-bold">
            {SCENERY_COPY.oneTapOverallProgress}: {overallProgress}% · {completedCount}/
            {eligibleCount || rows.length} eligible completed
          </p>
          <p className="text-sm">
            {SCENERY_COPY.oneTapTransferred}: {formatBytes(transferredTotal)} ·{' '}
            {SCENERY_COPY.oneTapStored}: {formatBytes(storedTotal)}
          </p>
          <div className={INTAKE_LAYOUT.progress} aria-hidden="true">
            <div
              className="h-2 rounded-full bg-[var(--color-primary)] motion-safe:transition-all"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className={INTAKE_LAYOUT.fileRow}>
            <p className="font-bold">{row.file.name}</p>
            <p className="text-[var(--color-text-muted)]">{row.file.size} bytes</p>
            <p>Collection: {row.collectionId || 'unmapped'}</p>
            <p>Upload progress: {row.progress}%</p>
            <p>Multipart progress: {row.multipartProgress}</p>
            <p>
              {SCENERY_COPY.oneTapTransferred}: {formatBytes(row.transferredBytes)} ·{' '}
              {SCENERY_COPY.oneTapStored}: {formatBytes(row.storedBytes)}
            </p>
            <p>
              State: {recoveredStateLabel(row.recoveredState)} (
              {row.recoveredState.replace(/_/g, ' ')})
            </p>
            <p>
              {SCENERY_COPY.oneTapVerification}: {row.storageStatus}
            </p>
            <p>
              {SCENERY_COPY.oneTapQuarantineReason}: {row.quarantineReason || 'none'}
            </p>
            <p>
              {SCENERY_COPY.oneTapInspectionReadiness}: {row.inspectionStatus}
            </p>
            {row.error ? (
              <p className="text-[var(--color-danger-foreground)]">{row.error}</p>
            ) : null}
            <details className="mt-2">
              <summary className="cursor-pointer font-bold">{SCENERY_COPY.oneTapAdvanced}</summary>
              <p>
                SHA-256: {row.hashStatus}
                {row.sha256 ? ` · ${row.sha256.slice(0, 12)}…` : ''}
              </p>
              <p>Storage: {row.storageStatus}</p>
              <p>Duplicate: {row.duplicateStatus}</p>
              <p>Quarantine: {row.quarantineStatus}</p>
              <p>Inspection readiness: {row.inspectionStatus}</p>
              <p>Session: {row.sessionId ? 'present' : 'none'}</p>
            </details>
            {row.eligible ? (
              <div className={INTAKE_LAYOUT.actions}>
                <button
                  type="button"
                  className="btn-secondary min-h-11 px-3 py-2"
                  onClick={() => resume(row)}
                >
                  {SCENERY_COPY.oneTapResume}
                </button>
                <button
                  type="button"
                  className="btn-secondary min-h-11 px-3 py-2"
                  onClick={() => pause(row)}
                >
                  {SCENERY_COPY.oneTapPause}
                </button>
                <button
                  type="button"
                  className="btn-secondary min-h-11 px-3 py-2"
                  onClick={() => resume(row)}
                >
                  {SCENERY_COPY.oneTapRetryFailed}
                </button>
                <button
                  type="button"
                  className="btn-secondary min-h-11 px-3 py-2"
                  onClick={() => cancel(row)}
                >
                  {SCENERY_COPY.oneTapCancel}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn-primary min-h-11 w-full px-4 text-sm sm:w-auto"
        disabled={busy || eligibleCount === 0}
        onClick={uploadEligible}
      >
        {SCENERY_COPY.oneTapUploadEligible}
      </button>
    </section>
  );
}
