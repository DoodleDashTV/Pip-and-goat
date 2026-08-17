'use client';

import { useEffect, useMemo, useState } from 'react';
import { publicVoiceIdentitySnapshot } from '@/lib/voice-production/approved-voice-settings';
import {
  applyEpisodeLineEdit,
  confirmationKey,
  EPISODE_LINE_BRAND_MESSAGE,
  EPISODE_VOICE_COPY,
  parseEpisodeScript,
  publicEpisodeCharacters,
  readEpisodeVoiceSession,
  visibleStatusFor,
  writeEpisodeVoiceSession,
  type EpisodeSpeaker,
  type PublicEpisodeVoiceLine,
} from '@/lib/voice-production/episode-voice-lines';
import { SAMPLE_GOAT_DIALOGUE, SAMPLE_PIP_DIALOGUE, SAMPLE_VOICE_EPISODE_TITLE } from '@/lib/voice-production/sample-episode';
import { DURABLE_LEDGER_COPY, type PublicDurableVoiceLedger } from '@/lib/voice-production/durable-voice-ledger-public';
import {
  SCRIPT_TO_VOICE_LOCKED_MESSAGE,
  SCRIPT_TO_VOICE_MAX_CHARS,
  SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
  SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
} from '@/lib/voice-production/script-line';

const VOICE_IDENTITY = publicVoiceIdentitySnapshot();
const CHARACTERS = publicEpisodeCharacters();
const DEFAULT_SCRIPT = `Pip: ${SAMPLE_PIP_DIALOGUE}\nGoat: ${SAMPLE_GOAT_DIALOGUE}`;

type Allowance = {
  locked: boolean;
  message: string;
  paidRequests: number;
  remainingRequests: number;
  paidCharactersUsed: number;
  remainingCharacters: number;
  durableLedger: PublicDurableVoiceLedger;
};

const DEFAULT_DURABLE_LEDGER: PublicDurableVoiceLedger = {
  title: DURABLE_LEDGER_COPY.title,
  status: 'unavailable',
  message: DURABLE_LEDGER_COPY.unavailable,
  available: false,
  reconciled: false,
  generateEnabled: false,
  paidRequests: null,
  paidCharactersUsed: null,
  remainingRequests: null,
  remainingCharacters: null,
  failedAttempts: null,
  authoritative: false,
  providerContacted: false,
  productionEnabled: false,
};

type Review = {
  episodeId: string;
  sceneId: string;
  lineId: string;
  lineNumber: number;
  character: EpisodeSpeaker;
  displayName: string;
  dialogue: string;
  characterCount: number;
  confirmationKey: string;
  remainingRequests: number;
  remainingCharacters: number;
  requestId: string;
};

type Receipt = {
  displayName: string;
  dialogue: string;
  characterCount: number;
  lineNumber: number;
  episodeId: string;
  sceneId: string;
  requestId: string;
  audioDataUrl: string;
  createdAt: string;
  paidCharactersCharged: number;
  remainingRequests: number;
  remainingCharacters: number;
};

function newRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function EpisodeVoiceLines({
  episodeId = 'episode-preview',
  episodeTitle = SAMPLE_VOICE_EPISODE_TITLE,
  sceneId = 'scene-1',
  initialLocked = true,
  initialMessage = SCRIPT_TO_VOICE_LOCKED_MESSAGE,
}: {
  episodeId?: string;
  episodeTitle?: string;
  sceneId?: string;
  initialLocked?: boolean;
  initialMessage?: string;
}) {
  const [allowance, setAllowance] = useState<Allowance>({
    locked: initialLocked,
    message: initialMessage,
    paidRequests: 0,
    remainingRequests: SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
    paidCharactersUsed: 0,
    remainingCharacters: SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
    durableLedger: DEFAULT_DURABLE_LEDGER,
  });
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [lines, setLines] = useState<PublicEpisodeVoiceLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testToken, setTestToken] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [playback, setPlayback] = useState<Record<string, string>>({});
  const [approvals, setApprovals] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readEpisodeVoiceSession();
    if (stored?.lines.length) {
      setLines(stored.lines);
      setPlayback(stored.playback);
      setApprovals(stored.approvals);
      setSelectedId(stored.lines[0]?.lineId ?? null);
    }
    void fetch('/api/voice-production/episode-lines')
      .then((res) => res.json())
      .then((data) => {
        setAllowance({
          locked: Boolean(data.locked),
          message: data.message ?? SCRIPT_TO_VOICE_LOCKED_MESSAGE,
          paidRequests: data.ledger?.paidRequests ?? 0,
          remainingRequests: data.ledger?.remainingRequests ?? SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
          paidCharactersUsed: data.ledger?.paidCharactersUsed ?? 0,
          remainingCharacters: data.ledger?.remainingCharacters ?? SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
          durableLedger: data.durableLedger ?? DEFAULT_DURABLE_LEDGER,
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!lines.length) return;
    writeEpisodeVoiceSession({ lines, playback, approvals });
  }, [lines, playback, approvals]);

  const selected = lines.find((line) => line.lineId === selectedId) ?? null;
  const selectedCount = useMemo(() => Array.from(selected?.dialogue ?? '').length, [selected?.dialogue]);

  function persistLines(next: PublicEpisodeVoiceLine[], nextSelected = selectedId) {
    setLines(next);
    setSelectedId(nextSelected);
  }

  function splitScript() {
    setError(null);
    setReview(null);
    setConfirmed(false);
    setReceipt(null);
    try {
      const next = parseEpisodeScript(script, { episodeId, sceneId });
      persistLines(next, next[0]?.lineId ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Script could not be split.');
    }
  }

  function editSelected(patch: Partial<Pick<PublicEpisodeVoiceLine, 'dialogue' | 'character'>>) {
    if (!selected) return;
    setReview(null);
    setConfirmed(false);
    setReceipt(null);
    persistLines(
      lines.map((line) => (line.lineId === selected.lineId ? applyEpisodeLineEdit(line, patch) : line)),
    );
  }

  async function reviewLine() {
    if (!selected || running) return;
    setRunning(true);
    setError(null);
    setReceipt(null);
    setConfirmed(false);
    try {
      const res = await fetch('/api/voice-production/episode-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate-episode-line',
          episodeId: selected.episodeId,
          sceneId: selected.sceneId,
          lineId: selected.lineId,
          lineNumber: selected.lineNumber,
          character: selected.character,
          dialogue: selected.dialogue,
          title: episodeTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReview(null);
        setError(data.code === 'LEGACY_BRAND_REFUSED' ? EPISODE_LINE_BRAND_MESSAGE : (data.error ?? EPISODE_LINE_BRAND_MESSAGE));
        return;
      }
      setReview({
        episodeId: data.episodeId,
        sceneId: data.sceneId,
        lineId: data.lineId,
        lineNumber: data.lineNumber,
        character: data.character,
        displayName: data.displayName,
        dialogue: data.dialogue,
        characterCount: data.characterCount,
        confirmationKey: data.confirmationKey,
        remainingRequests: data.remainingRequests,
        remainingCharacters: data.remainingCharacters,
        requestId: newRequestId(),
      });
      persistLines(
        lines.map((line) =>
          line.lineId === selected.lineId
            ? {
                ...line,
                reviewStatus: 'reviewed',
                confirmationStatus: 'required',
                visibleStatus: visibleStatusFor({
                  ...line,
                  reviewStatus: 'reviewed',
                  confirmationStatus: 'required',
                }),
              }
            : line,
        ),
      );
    } catch {
      setError('Line could not be reviewed.');
    } finally {
      setRunning(false);
    }
  }

  async function generateOnce() {
    if (!selected || !review || !confirmed || running) return;
    if (confirmationKey(selected) !== review.confirmationKey) {
      setConfirmed(false);
      setReview(null);
      setError('This line changed after confirmation. Review it again before generating.');
      return;
    }
    setRunning(true);
    setError(null);
    persistLines(
      lines.map((line) =>
        line.lineId === selected.lineId
          ? { ...line, generationStatus: 'generating', visibleStatus: 'Generating' }
          : line,
      ),
    );
    try {
      const res = await fetch('/api/voice-production/episode-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-confirmed-episode-line',
          episodeId: review.episodeId,
          sceneId: review.sceneId,
          lineId: review.lineId,
          lineNumber: review.lineNumber,
          character: review.character,
          dialogue: review.dialogue,
          title: episodeTitle,
          requestId: review.requestId,
          testToken,
          confirmed: true,
          confirmationKey: review.confirmationKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        persistLines(
          lines.map((line) =>
            line.lineId === selected.lineId
              ? { ...line, generationStatus: 'failed', visibleStatus: 'Failed without charge' }
              : line,
          ),
        );
        setError(data.code === 'LEGACY_BRAND_REFUSED' ? EPISODE_LINE_BRAND_MESSAGE : (data.error ?? 'Episode line generation refused.'));
        return;
      }
      const nextReceipt: Receipt = {
        displayName: data.displayName,
        dialogue: data.dialogue,
        characterCount: data.characterCount,
        lineNumber: data.lineNumber,
        episodeId: data.episodeId,
        sceneId: data.sceneId,
        requestId: data.requestId,
        audioDataUrl: data.audioDataUrl,
        createdAt: data.createdAt,
        paidCharactersCharged: data.paidCharactersCharged,
        remainingRequests: data.remainingRequests,
        remainingCharacters: data.remainingCharacters,
      };
      setReceipt(nextReceipt);
      setPlayback((current) => ({ ...current, [selected.lineId]: data.audioDataUrl }));
      setAllowance((current) => ({
        ...current,
        paidRequests: data.ledger?.paidRequests ?? current.paidRequests,
        remainingRequests: data.remainingRequests,
        paidCharactersUsed: data.ledger?.paidCharactersUsed ?? current.paidCharactersUsed,
        remainingCharacters: data.remainingCharacters,
      }));
      persistLines(
        lines.map((line) =>
          line.lineId === selected.lineId
            ? {
                ...line,
                generationStatus: 'generated',
                confirmationStatus: 'confirmed',
                receiptRef: data.receiptRef ?? data.requestId,
                visibleStatus: 'Generated',
              }
            : line,
        ),
      );
      setReview(null);
      setConfirmed(false);
    } catch {
      setError('Episode line generation refused.');
    } finally {
      setRunning(false);
    }
  }

  function decide(decision: 'approved' | 'rejected') {
    if (!selected) return;
    setApprovals((current) => ({ ...current, [selected.lineId]: decision }));
    persistLines(
      lines.map((line) =>
        line.lineId === selected.lineId
          ? {
              ...line,
              approvalStatus: decision,
              visibleStatus: decision === 'approved' ? 'Approved' : 'Rejected',
            }
          : line,
      ),
    );
  }

  function workOnNextLine() {
    const index = lines.findIndex((line) => line.lineId === selectedId);
    const next = lines[index + 1] ?? lines[0];
    setSelectedId(next?.lineId ?? null);
    setReview(null);
    setConfirmed(false);
    setReceipt(null);
    setError(null);
  }

  return (
    <section className="studio-card space-y-3 overflow-x-hidden p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">{EPISODE_VOICE_COPY.sectionTitle}</h2>
      <p className="status-success inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
        {EPISODE_VOICE_COPY.voicesTitle}
      </p>
      <p className="status-warning inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
        {EPISODE_VOICE_COPY.cadence}
      </p>
      <p className="status-error inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
        {EPISODE_VOICE_COPY.paidWarning}
      </p>
      <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">{allowance.message}</p>
      <p className="status-warning inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
        {DURABLE_LEDGER_COPY.title}
      </p>
      <p
        className={`${allowance.durableLedger.generateEnabled ? 'status-success' : 'status-error'} inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold`}
      >
        {allowance.durableLedger.message}
      </p>
      {allowance.durableLedger.authoritative ? (
        <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
          Remaining Preview allowance {allowance.remainingRequests} / {SCRIPT_TO_VOICE_MAX_PAID_REQUESTS} requests and{' '}
          {allowance.remainingCharacters} / {SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS} characters.
        </p>
      ) : (
        <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
          Authoritative used and remaining totals are hidden until the durable ledger is available and prior
          usage is reconciled.
        </p>
      )}
      <div className="grid gap-3">
        {CHARACTERS.map((character) => (
          <article key={character.characterId} className="rounded-2xl border border-[var(--color-border)] p-3">
            <h3 className="font-display text-lg font-semibold">{character.displayName}</h3>
            <p className="break-words text-sm leading-6">{character.personality.join(', ')}</p>
          </article>
        ))}
      </div>

      <label className="block text-sm font-semibold">
        Episode script
        <textarea
          value={script}
          rows={5}
          onChange={(event) => {
            setScript(event.target.value);
            setError(null);
          }}
          className="field-input mt-2 min-h-[7rem]"
        />
      </label>
      <button type="button" className="btn-primary w-full px-4 text-sm" disabled={running} onClick={splitScript}>
        Split into voice lines
      </button>

      {lines.length ? (
        <ol className="grid gap-2">
          {lines.map((line) => (
            <li key={line.lineId}>
              <button
                type="button"
                className={`w-full rounded-2xl border p-3 text-left ${
                  line.lineId === selectedId
                    ? 'border-[var(--color-primary)] bg-[var(--color-success-soft)]'
                    : 'border-[var(--color-border)]'
                }`}
                onClick={() => {
                  setSelectedId(line.lineId);
                  setReview(null);
                  setConfirmed(false);
                  setReceipt(null);
                  setError(null);
                }}
              >
                <p className="text-sm font-bold">
                  Line {line.lineNumber}: {line.character === 'pip' ? 'Pip' : 'Goat'}
                </p>
                <p className="break-words text-sm leading-6">{line.dialogue}</p>
                <p className="text-xs font-bold">{line.visibleStatus}</p>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {selected ? (
        <div className="space-y-3 rounded-2xl border border-[var(--color-border)] p-3">
          <p className="text-sm font-bold">
            Editing line {selected.lineNumber} — {selected.character === 'pip' ? 'Pip' : 'Goat'}
          </p>
          <label className="block text-sm font-semibold">
            Speaker
            <select
              value={selected.character}
              onChange={(event) => editSelected({ character: event.target.value as EpisodeSpeaker })}
              className="field-input mt-2"
            >
              <option value="pip">Pip</option>
              <option value="goat">Goat</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Dialogue
            <textarea
              value={selected.dialogue}
              maxLength={SCRIPT_TO_VOICE_MAX_CHARS}
              rows={3}
              onChange={(event) => editSelected({ dialogue: event.target.value })}
              className="field-input mt-2 min-h-[5.5rem]"
            />
          </label>
          <p className="text-sm font-bold">
            Characters: {selectedCount} / {SCRIPT_TO_VOICE_MAX_CHARS}
          </p>
          <label className="block text-sm font-semibold">
            Preview test token
            <input
              type="password"
              autoComplete="off"
              value={testToken}
              onChange={(event) => setTestToken(event.target.value)}
              className="field-input mt-2"
            />
          </label>
          <button type="button" className="btn-primary w-full px-4 text-sm" disabled={running} onClick={() => void reviewLine()}>
            {running && !review ? 'Reviewing…' : EPISODE_VOICE_COPY.reviewLine}
          </button>
        </div>
      ) : null}

      {review ? (
        <div className="space-y-3 rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-[var(--color-warning-foreground)]">
          <p className="font-bold">Confirm this exact episode line</p>
          <p className="break-words text-sm leading-6">Episode: {episodeTitle}</p>
          <p className="break-words text-sm leading-6">Scene: {review.sceneId}</p>
          <p className="break-words text-sm leading-6">Line number: {review.lineNumber}</p>
          <p className="break-words text-sm leading-6">Character: {review.displayName}</p>
          <p className="break-words text-sm leading-6">Dialogue: {review.dialogue}</p>
          <p className="text-sm font-bold">
            Characters: {review.characterCount} / {SCRIPT_TO_VOICE_MAX_CHARS}
          </p>
          <p className="break-words text-sm leading-6">
            Model {VOICE_IDENTITY.model}. Output {VOICE_IDENTITY.outputFormat}. Stability{' '}
            {VOICE_IDENTITY.settings.stability}, similarity {VOICE_IDENTITY.settings.similarity}, style{' '}
            {VOICE_IDENTITY.settings.style}, speed {VOICE_IDENTITY.settings.speed}, speaker boost{' '}
            {VOICE_IDENTITY.settings.speakerBoost ? 'on' : 'off'}.
          </p>
          <p className="break-words text-sm leading-6">
            Remaining Preview allowance {review.remainingRequests} requests and {review.remainingCharacters} characters.
          </p>
          <label className="flex items-start gap-2 text-sm font-bold">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            I confirm this exact line should be generated once.
          </label>
          <button
            type="button"
            className="btn-primary w-full px-4 text-sm"
            disabled={running || !confirmed || allowance.locked || !allowance.durableLedger.generateEnabled}
            onClick={() => void generateOnce()}
          >
            {running ? 'Generating once…' : EPISODE_VOICE_COPY.generateOnce}
          </button>
        </div>
      ) : null}

      {receipt ? (
        <div className="space-y-2 rounded-2xl border border-[var(--color-border)] p-3">
          <p className="status-warning inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
            Generated line {receipt.lineNumber}
          </p>
          <p className="break-words text-sm leading-6">
            {receipt.displayName}: {receipt.dialogue}
          </p>
          <p className="break-words text-sm leading-6">
            Receipt {receipt.requestId}. Paid characters charged {receipt.paidCharactersCharged}. Remaining{' '}
            {receipt.remainingRequests} requests and {receipt.remainingCharacters} characters.
          </p>
          <audio controls src={receipt.audioDataUrl} className="w-full max-w-full" />
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-primary w-full px-4 text-sm" onClick={() => decide('approved')}>
              Approve this line
            </button>
            <button
              type="button"
              className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
              onClick={() => decide('rejected')}
            >
              Reject this line
            </button>
            <button
              type="button"
              className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
              onClick={workOnNextLine}
            >
              {EPISODE_VOICE_COPY.nextLine}
            </button>
          </div>
        </div>
      ) : null}

      {playback[selected?.lineId ?? ''] && !receipt ? (
        <audio controls src={playback[selected?.lineId ?? '']} className="w-full max-w-full" />
      ) : null}

      {error ? <p className="break-words text-sm font-bold text-[var(--color-danger, #9b1c1c)]">{error}</p> : null}
    </section>
  );
}
