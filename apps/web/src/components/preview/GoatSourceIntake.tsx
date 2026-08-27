'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { hashFileChunked } from '@/lib/scenery/intake/client-hash';
import { uploadSignedPart } from '@/lib/scenery/intake/client-transfer';
import { describeGoatSessionOpenFailure } from '@/lib/tivvlejoy-character-source-intake/client-failure';
import {
  GOAT_SOURCE_FILENAME,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
} from '@/lib/tivvlejoy-character-source-intake/goat-spec';
import { preflightGoatUpload, verifyGoatSourceHash } from '@/lib/tivvlejoy-character-source-intake/preflight';

const SAVED_SESSION_KEY = 'tivvlejoy.goat.source.intake.session.v1';
const STUDIO_TOKEN_HEADER = 'x-tivvlejoy-scenery-intake-token';

type SavedSession = {
  sessionId: string;
  sha256: string;
};

type IntakeStatus = {
  state?: string;
  nextUserAction?: string;
  checklist?: {
    goatSource: { uploaded: boolean; shaVerified: boolean; sourceLocked: boolean };
    goatWorking: boolean;
    goatRig: boolean;
    goatDeformationQa: boolean;
    goatAnimationQa: boolean;
    goatProductionMaster: string;
  };
  authorization?: { publicPreview?: boolean; tokenConfigured?: boolean };
};

function readTokenFromField(input: HTMLInputElement | null, stateValue: string): string {
  return (input?.value || stateValue).trim();
}

function intakeHeaders(token: string): HeadersInit {
  const value: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) value[STUDIO_TOKEN_HEADER] = token;
  return value;
}

function Row({ done, label }: { done: boolean; label: string }) {
  return (
    <p className="text-sm">
      {done ? '✓' : '○'} {label}
    </p>
  );
}

export function GoatSourceIntake({ initial }: { initial: IntakeStatus }) {
  const [status, setStatus] = useState<IntakeStatus>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('Waiting for Goat_FINN.zip');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const checklist = status.checklist ?? {
    goatSource: { uploaded: false, shaVerified: false, sourceLocked: false },
    goatWorking: false,
    goatRig: false,
    goatDeformationQa: false,
    goatAnimationQa: false,
    goatProductionMaster: 'LOCKED',
  };
  const needsStudioSession = Boolean(
    status.authorization?.publicPreview && status.authorization?.tokenConfigured,
  );
  const selectedName = useMemo(() => file?.name ?? '', [file]);

  function readSavedSession(): SavedSession | null {
    try {
      const raw = window.localStorage.getItem(SAVED_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedSession;
      return parsed.sessionId && parsed.sha256 ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeSavedSession(next: SavedSession | null) {
    if (!next) {
      window.localStorage.removeItem(SAVED_SESSION_KEY);
      return;
    }
    window.localStorage.setItem(SAVED_SESSION_KEY, JSON.stringify(next));
  }

  async function refresh() {
    const response = await fetch('/api/character-source-intake');
    if (response.ok) setStatus((await response.json()) as IntakeStatus);
  }

  useEffect(() => {
    void refresh();
    const saved = readSavedSession();
    if (saved) {
      setPhase('Interrupted upload can resume');
    }
  }, []);

  async function upload() {
    if (!file) {
      setError('Select Goat_FINN.zip first.');
      setErrorCode('MISSING_FILE');
      return;
    }
    const studioToken = readTokenFromField(tokenInputRef.current, token);
    if (needsStudioSession && !studioToken) {
      const failure = describeGoatSessionOpenFailure({
        code: 'INTAKE_UNAUTHORIZED',
        tokenPresented: false,
      });
      setError(failure.error);
      setErrorCode(failure.code);
      setPhase(failure.phase);
      return;
    }
    setError(null);
    setErrorCode(null);
    setBusy(true);
    try {
      const preflight = preflightGoatUpload({ filename: file.name, byteSize: file.size });
      if (!preflight.ok) {
        setError(preflight.reason);
        setErrorCode(preflight.code);
        setPhase('Failed');
        return;
      }
      setPhase('Hashing Goat source');
      const hashed = await hashFileChunked(file, (offset, total) => {
        setProgress(Math.round((offset / total) * 35));
      });
      const hash = verifyGoatSourceHash(hashed.sha256);
      if (!hash.ok) {
        setError(hash.reason);
        setErrorCode(hash.code);
        setPhase('Failed');
        return;
      }
      setPhase('Opening upload session');
      type SessionPayload = {
        error?: string;
        code?: string;
        alreadyPresent?: boolean;
        connectionReadyOnly?: boolean;
        tokenPresented?: boolean;
        nextUserAction?: string;
        session?: { sessionId: string; parts: Array<{ partNumber: number; start: number; end: number; hasEtag?: boolean }> };
      };
      const saved = readSavedSession();
      let createdJson: SessionPayload | null = null;
      if (saved?.sha256 === hashed.sha256) {
        const resumed = await fetch('/api/character-source-intake', {
          method: 'POST',
          headers: intakeHeaders(studioToken),
          body: JSON.stringify({ action: 'resume', sessionId: saved.sessionId }),
        });
        const resumedJson = (await resumed.json()) as SessionPayload & { resume?: { resumable?: boolean } };
        if (resumed.ok && resumedJson.session) {
          createdJson = resumedJson;
          setPhase('Resuming interrupted Goat upload');
        } else if (resumed.status === 401) {
          const failure = describeGoatSessionOpenFailure({
            httpStatus: resumed.status,
            code: resumedJson.code,
            error: resumedJson.error,
            tokenPresented: Boolean(studioToken),
            resumable: true,
          });
          setError(failure.error);
          setErrorCode(failure.code);
          setPhase(failure.phase);
          if (resumedJson.nextUserAction) {
            setStatus((current) => ({ ...current, nextUserAction: resumedJson.nextUserAction }));
          }
          return;
        } else {
          writeSavedSession(null);
        }
      }
      if (!createdJson) {
        const created = await fetch('/api/character-source-intake', {
          method: 'POST',
          headers: intakeHeaders(studioToken),
          body: JSON.stringify({
            action: 'create-session',
            filename: GOAT_SOURCE_FILENAME,
            byteSize: hashed.byteSize,
            sha256: hashed.sha256,
          }),
        });
        createdJson = (await created.json()) as SessionPayload;
        if (!created.ok) {
          const failure = describeGoatSessionOpenFailure({
            httpStatus: created.status,
            code: createdJson.code,
            error: createdJson.error,
            tokenPresented: Boolean(studioToken),
            resumable: Boolean(readSavedSession()),
          });
          setError(failure.error);
          setErrorCode(failure.code);
          setPhase(failure.phase);
          if (createdJson.nextUserAction) {
            setStatus((current) => ({ ...current, nextUserAction: createdJson?.nextUserAction }));
          }
          return;
        }
      }
      if (createdJson.alreadyPresent) {
        writeSavedSession(null);
        setPhase('Source already locked');
        setProgress(100);
        await refresh();
        return;
      }
      if (createdJson.connectionReadyOnly || !createdJson.session) {
        setError('Private storage is not configured yet. Your file stayed on this device.');
        setErrorCode('STORAGE_UNAVAILABLE');
        setPhase('Failed');
        return;
      }
      const sessionId = createdJson.session.sessionId;
      writeSavedSession({ sessionId, sha256: hashed.sha256 });
      const parts = createdJson.session.parts.filter((part) => !part.hasEtag);
      for (const [index, part] of parts.entries()) {
        setPhase(`Uploading part ${part.partNumber} of ${createdJson.session.parts.length}`);
        const signed = await fetch('/api/character-source-intake', {
          method: 'POST',
          headers: intakeHeaders(studioToken),
          body: JSON.stringify({ action: 'sign-part', sessionId, partNumber: part.partNumber }),
        });
        const signedJson = (await signed.json()) as { error?: string; code?: string; signedUrl?: string };
        if (!signed.ok || !signedJson.signedUrl) {
          const failure = describeGoatSessionOpenFailure({
            httpStatus: signed.status,
            code: signedJson.code,
            error: signedJson.error ?? 'Could not sign the next part.',
            tokenPresented: Boolean(studioToken),
            resumable: true,
          });
          setError(failure.error);
          setErrorCode(failure.code);
          setPhase(failure.phase);
          await fetch('/api/character-source-intake', {
            method: 'POST',
            headers: intakeHeaders(studioToken),
            body: JSON.stringify({ action: 'resume', sessionId }),
          });
          return;
        }
        const blob = file.slice(part.start, part.end);
        const uploaded = await uploadSignedPart(signedJson.signedUrl, blob, () => {
          const base = 35 + Math.round(((index + 1) / parts.length) * 55);
          setProgress(base);
        });
        await fetch('/api/character-source-intake', {
          method: 'POST',
          headers: intakeHeaders(studioToken),
          body: JSON.stringify({
            action: 'resume',
            sessionId,
            partNumber: part.partNumber,
            etag: uploaded.etag,
          }),
        });
        writeSavedSession({ sessionId, sha256: hashed.sha256 });
      }
      setPhase('Verifying stored Goat source');
      const completed = await fetch('/api/character-source-intake', {
        method: 'POST',
        headers: intakeHeaders(studioToken),
        body: JSON.stringify({ action: 'complete', sessionId }),
      });
      const completedJson = (await completed.json()) as { error?: string; code?: string };
      if (!completed.ok) {
        const failure = describeGoatSessionOpenFailure({
          httpStatus: completed.status,
          code: completedJson.code,
          error: completedJson.error ?? 'Verification failed. SOURCE was not locked.',
          tokenPresented: Boolean(studioToken),
          resumable: true,
        });
        setError(failure.error);
        setErrorCode(failure.code);
        setPhase(failure.phase);
        return;
      }
      writeSavedSession(null);
      setProgress(100);
      setPhase('Goat source locked');
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed.');
      setErrorCode('UPLOAD_FAILED');
      setPhase('Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="studio-card space-y-3 p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">GOAT SOURCE</h2>
      <p className="text-sm">Expected: {GOAT_SOURCE_FILENAME}</p>
      <p className="text-sm text-[var(--color-text-muted)]">
        {GOAT_SOURCE_SIZE_BYTES.toLocaleString()} bytes · SHA-256 locked
      </p>
      <p className="text-sm font-bold">Status: {status.state ?? 'NOT_UPLOADED'}</p>
      <Row done={checklist.goatSource.uploaded} label="Uploaded" />
      <Row done={checklist.goatSource.shaVerified} label="SHA-256 Verified" />
      <Row done={checklist.goatSource.sourceLocked} label="Source Locked" />
      <div className="pt-2">
        <h3 className="font-display text-lg font-semibold">GOAT WORKING</h3>
        <Row
          done={checklist.goatWorking}
          label={checklist.goatWorking ? 'Working copy ready' : 'Blender Conversion Pending'}
        />
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">GOAT RIG</h3>
        <Row done={checklist.goatRig} label="Pending" />
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">GOAT DEFORMATION QA</h3>
        <Row done={checklist.goatDeformationQa} label="Pending" />
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">GOAT ANIMATION QA</h3>
        <Row done={checklist.goatAnimationQa} label="Pending" />
      </div>
      <p className="text-sm font-bold">GOAT PRODUCTION MASTER {checklist.goatProductionMaster}</p>
      <label className="block text-sm font-bold">
        Choose File
        <input
          type="file"
          accept=".zip,application/zip"
          className="mt-2 block min-h-11 w-full text-sm"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            setError(null);
            setErrorCode(null);
            if (next && next.name !== GOAT_SOURCE_FILENAME) {
              setError(`Expected ${GOAT_SOURCE_FILENAME}.`);
              setErrorCode('WRONG_FILENAME');
            }
          }}
        />
      </label>
      {selectedName ? <p className="text-sm">Selected: {selectedName}</p> : null}
      <label className="block text-sm font-bold" htmlFor="tivvlejoy-goat-source-intake-token">
        Studio session
        <input
          id="tivvlejoy-goat-source-intake-token"
          ref={tokenInputRef}
          type="password"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          onInput={(event) => setToken((event.target as HTMLInputElement).value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--color-background)] p-2"
        />
      </label>
      <p className="text-xs text-[var(--color-text-muted)]">
        {needsStudioSession
          ? 'This Preview needs the existing studio session token. It is sent only as an approved header.'
          : 'Studio session is optional on a non-public studio host.'}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void upload()}
        className="min-h-11 rounded-2xl bg-[var(--color-text)] px-4 py-2 text-sm font-bold text-[var(--color-background)] disabled:opacity-60"
      >
        Upload Goat Source
      </button>
      <p className="text-sm">{phase}</p>
      <p className="text-sm">
        Progress: {progress}%
        {phase === 'Failed' && progress === 35 ? ' · stopped after hashing. Session was not opened.' : ''}
      </p>
      {errorCode ? <p className="text-sm font-bold">Code: {errorCode}</p> : null}
      {error ? <p className="text-sm font-bold">{error}</p> : null}
      <p className="text-sm text-[var(--color-text-muted)]">{status.nextUserAction}</p>
      <p className="text-xs text-[var(--color-text-muted)]">
        Expected hash prefix {GOAT_SOURCE_SHA256.slice(0, 12)}… is checked before upload. Credentials never leave the
        server.
      </p>
    </section>
  );
}
