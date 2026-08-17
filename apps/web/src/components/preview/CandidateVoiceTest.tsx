'use client';

import { useEffect, useState } from 'react';
import {
  FIXED_CANDIDATE_LINES,
  LIVE_TEST_LOCKED_MESSAGE,
  publicCandidateDirectory,
  type PublicCandidate,
} from '@/lib/voice-production/candidates';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, type RegisteredCharacterId } from '@/lib/voice-production/types';

type LiveTestSnapshot = {
  status: 'locked' | 'candidates-missing' | 'awaiting-confirmation';
  locked: boolean;
  message: string;
  candidates: PublicCandidate[];
  maxCharacters: number;
};

type PendingConfirm = {
  candidate: PublicCandidate;
  requestId: string;
};

function newRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function CandidateVoiceTest() {
  const [liveTest, setLiveTest] = useState<LiveTestSnapshot>({
    status: 'locked',
    locked: true,
    message: LIVE_TEST_LOCKED_MESSAGE,
    candidates: publicCandidateDirectory(),
    maxCharacters: 300,
  });
  const [testToken, setTestToken] = useState('');
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<string, string>>({});

  useEffect(() => {
    void fetch('/api/voice-production/candidates')
      .then((res) => res.json())
      .then((data) => {
        if (data.liveTest) setLiveTest(data.liveTest);
      })
      .catch(() => undefined);
  }, []);

  const pipCandidates = liveTest.candidates.filter((item) => item.characterId === PIP_CHARACTER_ID);
  const goatCandidates = liveTest.candidates.filter((item) => item.characterId === GOAT_CHARACTER_ID);

  function startConfirm(candidate: PublicCandidate) {
    setError(null);
    setPending({ candidate, requestId: newRequestId() });
  }

  async function generateOnce() {
    if (!pending || running) return;
    setRunning(true);
    setError(null);
    const { candidate, requestId } = pending;
    const text = FIXED_CANDIDATE_LINES[candidate.characterId as RegisteredCharacterId];
    try {
      const res = await fetch('/api/voice-production/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-candidate',
          characterId: candidate.characterId,
          candidateSlot: candidate.slot,
          text,
          requestId,
          testToken,
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Live voice test refused.');
        setPending(null);
        return;
      }
      if (data.audioDataUrl) {
        setClips((current) => ({ ...current, [candidate.slot]: data.audioDataUrl }));
      }
      setPending(null);
    } catch {
      setError('Live voice test refused.');
      setPending(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="studio-card space-y-3 overflow-x-hidden p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">ElevenLabs candidate test</h2>
      <p className="status-error inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
        {liveTest.locked ? 'Live voice test locked' : 'Live voice test ready after confirmation'}
      </p>
      <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">{liveTest.message}</p>
      <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
        Candidate evaluation only. This does not lock, register, clone, or replace Pip or Goat’s permanent voice.
        Configure the API key and authorization in Vercel Preview settings. Never paste a key into this page.
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
      <p className="break-words text-xs leading-5 text-[var(--color-text-muted)]">
        Kept in this page only. Cleared on reload. Not stored, downloaded, or put in the URL.
      </p>

      {([
        ['Pip candidates', pipCandidates],
        ['Goat candidates', goatCandidates],
      ] as const).map(([title, list]) => (
        <div key={title} className="space-y-2">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          {list.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Candidate voices not configured</p>
          ) : (
            list.map((candidate) => (
              <article key={candidate.slot} className="space-y-2 rounded-2xl border border-[var(--color-border)] p-3">
                <p className="text-sm font-bold">{candidate.label}</p>
                <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">{candidate.direction}</p>
                <p className="break-words text-sm leading-6">{FIXED_CANDIDATE_LINES[candidate.characterId]}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {candidate.configured ? 'Slot reserved on the server' : 'Candidate voices not configured'}
                </p>
                {clips[candidate.slot] ? (
                  <div className="space-y-2">
                    <p className="status-warning inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
                      ElevenLabs candidate test — not Pip/Goat’s approved permanent voice.
                    </p>
                    <audio controls src={clips[candidate.slot]} className="w-full max-w-full" />
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn-primary w-full px-4 text-sm"
                  disabled={running || liveTest.locked || !candidate.configured}
                  onClick={() => startConfirm(candidate)}
                >
                  Review and generate once
                </button>
              </article>
            ))
          )}
        </div>
      ))}

      {pending ? (
        <div className="space-y-3 rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-[var(--color-warning-foreground)]">
          <p className="font-bold">Confirm one paid candidate request</p>
          <p className="break-words text-sm leading-6">
            Character: {pending.candidate.characterId === PIP_CHARACTER_ID ? 'Pip' : 'Goat'}
          </p>
          <p className="break-words text-sm leading-6">Candidate: {pending.candidate.label}</p>
          <p className="break-words text-sm leading-6">
            Text: {FIXED_CANDIDATE_LINES[pending.candidate.characterId]}
          </p>
          <p className="text-sm font-bold">
            Characters: {Array.from(FIXED_CANDIDATE_LINES[pending.candidate.characterId]).length} /{' '}
            {liveTest.maxCharacters}
          </p>
          <p className="break-words text-sm leading-6">ElevenLabs will be contacted for this one request.</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-primary w-full px-4 text-sm"
              disabled={running}
              onClick={() => void generateOnce()}
            >
              {running ? 'Generating once…' : 'Generate once'}
            </button>
            <button
              type="button"
              className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
              disabled={running}
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="break-words text-sm font-bold text-[var(--color-danger, #9b1c1c)]">{error}</p> : null}
    </section>
  );
}
