'use client';

import { useEffect, useState } from 'react';
import {
  APPROVED_SAMPLE_AUDIO_LABEL,
  FIXED_APPROVED_LINES,
  LIVE_TEST_LOCKED_MESSAGE,
  REQUIRED_VOICE_TEST_MAX_CHARACTERS,
  publicApprovedSamples,
  type PublicApprovedSample,
} from '@/lib/voice-production/candidates';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, type RegisteredCharacterId } from '@/lib/voice-production/types';

type LiveTestSnapshot = {
  status: 'locked' | 'awaiting-confirmation';
  locked: boolean;
  message: string;
  samples: PublicApprovedSample[];
  maxCharacters: number;
};

type PendingConfirm = {
  sample: PublicApprovedSample;
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
    samples: publicApprovedSamples(),
    maxCharacters: REQUIRED_VOICE_TEST_MAX_CHARACTERS,
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
        if (data.liveTest) {
          setLiveTest({
            status: data.liveTest.status === 'awaiting-confirmation' ? 'awaiting-confirmation' : 'locked',
            locked: Boolean(data.liveTest.locked),
            message: data.liveTest.message ?? LIVE_TEST_LOCKED_MESSAGE,
            samples: Array.isArray(data.liveTest.samples) ? data.liveTest.samples : publicApprovedSamples(),
            maxCharacters: REQUIRED_VOICE_TEST_MAX_CHARACTERS,
          });
        }
      })
      .catch(() => undefined);
  }, []);

  function startConfirm(sample: PublicApprovedSample) {
    setError(null);
    setPending({ sample, requestId: newRequestId() });
  }

  async function generateOnce() {
    if (!pending || running) return;
    setRunning(true);
    setError(null);
    const { sample, requestId } = pending;
    const text = FIXED_APPROVED_LINES[sample.characterId as RegisteredCharacterId];
    try {
      const res = await fetch('/api/voice-production/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-approved-sample',
          characterId: sample.characterId,
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
        setClips((current) => ({ ...current, [sample.characterId]: data.audioDataUrl }));
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
      <h2 className="font-display text-xl font-semibold">Approved Pip and Goat voices</h2>
      <p className="status-error inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
        {liveTest.locked ? 'Live voice test locked' : 'Live voice test ready after confirmation'}
      </p>
      <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">{liveTest.message}</p>
      <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
        These are the final approved Pip and Goat voices. Generate one fixed sample each after confirmation.
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

      {liveTest.samples.map((sample) => (
        <article key={sample.characterId} className="space-y-2 rounded-2xl border border-[var(--color-border)] p-3">
          <h3 className="font-display text-lg font-semibold">{sample.displayName}</h3>
          <p className="break-words text-sm leading-6">{sample.text}</p>
          {clips[sample.characterId] ? (
            <div className="space-y-2">
              <p className="status-warning inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
                {APPROVED_SAMPLE_AUDIO_LABEL}
              </p>
              <audio controls src={clips[sample.characterId]} className="w-full max-w-full" />
            </div>
          ) : null}
          <button
            type="button"
            className="btn-primary w-full px-4 text-sm"
            disabled={running || liveTest.locked}
            onClick={() => startConfirm(sample)}
          >
            {sample.actionLabel}
          </button>
        </article>
      ))}

      {pending ? (
        <div className="space-y-3 rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-[var(--color-warning-foreground)]">
          <p className="font-bold">Confirm one paid approved-voice request</p>
          <p className="break-words text-sm leading-6">
            Character: {pending.sample.characterId === PIP_CHARACTER_ID ? 'Pip' : pending.sample.characterId === GOAT_CHARACTER_ID ? 'Goat' : 'Unknown'}
          </p>
          <p className="break-words text-sm leading-6">Action: {pending.sample.actionLabel}</p>
          <p className="break-words text-sm leading-6">Text: {FIXED_APPROVED_LINES[pending.sample.characterId]}</p>
          <p className="text-sm font-bold">
            Characters: {Array.from(FIXED_APPROVED_LINES[pending.sample.characterId]).length} /{' '}
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
