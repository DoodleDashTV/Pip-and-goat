'use client';

import { useEffect, useMemo, useState } from 'react';
import { publicVoiceIdentitySnapshot } from '@/lib/voice-production/approved-voice-settings';
import {
  SCRIPT_TO_VOICE_COPY,
  SCRIPT_TO_VOICE_LOCKED_MESSAGE,
  SCRIPT_TO_VOICE_MAX_CHARS,
  publicScriptCharacters,
  type PublicScriptCharacter,
} from '@/lib/voice-production/script-line';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, type RegisteredCharacterId } from '@/lib/voice-production/types';

const VOICE_IDENTITY = publicVoiceIdentitySnapshot();
const CHARACTERS = publicScriptCharacters();

type Snapshot = {
  locked: boolean;
  message: string;
  characters: PublicScriptCharacter[];
  monthlyUsed: number;
  monthlyLimit: number;
};

type Receipt = {
  displayName: string;
  text: string;
  characterCount: number;
  requestId: string;
  audioDataUrl: string;
  label: string;
  ledger?: { paidCharactersUsed: number; monthlyCharLimit: number; paidRequests: number };
};

function newRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function ConfirmedScriptToVoice() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    locked: true,
    message: SCRIPT_TO_VOICE_LOCKED_MESSAGE,
    characters: CHARACTERS,
    monthlyUsed: 0,
    monthlyLimit: 20000,
  });
  const [characterId, setCharacterId] = useState<RegisteredCharacterId>(PIP_CHARACTER_ID);
  const [text, setText] = useState('');
  const [testToken, setTestToken] = useState('');
  const [preview, setPreview] = useState<{
    displayName: string;
    text: string;
    characterCount: number;
    requestId: string;
  } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/voice-production/script-to-voice')
      .then((res) => res.json())
      .then((data) => {
        setSnapshot({
          locked: Boolean(data.locked),
          message: data.message ?? SCRIPT_TO_VOICE_LOCKED_MESSAGE,
          characters: Array.isArray(data.characters) ? data.characters : CHARACTERS,
          monthlyUsed: data.ledger?.paidCharactersUsed ?? 0,
          monthlyLimit: data.ledger?.monthlyCharLimit ?? 20000,
        });
      })
      .catch(() => undefined);
  }, []);

  const selected = snapshot.characters.find((item) => item.characterId === characterId) ?? CHARACTERS[0];
  const typedCount = useMemo(() => Array.from(text).length, [text]);

  async function reviewLine() {
    setError(null);
    setReceipt(null);
    setRunning(true);
    try {
      const res = await fetch('/api/voice-production/script-to-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate-line',
          characterId,
          text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreview(null);
        setError(data.error ?? 'Line must be rewritten using TivvleJoy-compatible language.');
        return;
      }
      setPreview({
        displayName: data.displayName ?? selected.displayName,
        text: data.text,
        characterCount: data.characterCount,
        requestId: newRequestId(),
      });
    } catch {
      setPreview(null);
      setError('Line could not be reviewed.');
    } finally {
      setRunning(false);
    }
  }

  async function generateOnce() {
    if (!preview || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/voice-production/script-to-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-confirmed-line',
          characterId,
          text: preview.text,
          requestId: preview.requestId,
          testToken,
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Preview voice generation refused.');
        return;
      }
      setReceipt({
        displayName: data.displayName,
        text: data.text,
        characterCount: data.characterCount,
        requestId: data.requestId,
        audioDataUrl: data.audioDataUrl,
        label: data.label,
        ledger: data.ledger,
      });
      if (data.ledger) {
        setSnapshot((current) => ({
          ...current,
          monthlyUsed: data.ledger.paidCharactersUsed,
          monthlyLimit: data.ledger.monthlyCharLimit,
        }));
      }
      setPreview(null);
    } catch {
      setError('Preview voice generation refused.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="studio-card space-y-3 overflow-x-hidden p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">{SCRIPT_TO_VOICE_COPY.pageTitle}</h2>
      <p className="status-success inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
        {SCRIPT_TO_VOICE_COPY.voicesTitle}
      </p>
      <p className="status-warning inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
        {SCRIPT_TO_VOICE_COPY.cadence}
      </p>
      <p className="status-error inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
        {SCRIPT_TO_VOICE_COPY.paidWarning}
      </p>
      <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
        Model {VOICE_IDENTITY.model}. Output {VOICE_IDENTITY.outputFormat}. Stability{' '}
        {VOICE_IDENTITY.settings.stability}, similarity {VOICE_IDENTITY.settings.similarity}, style{' '}
        {VOICE_IDENTITY.settings.style}, speed {VOICE_IDENTITY.settings.speed}, speaker boost{' '}
        {VOICE_IDENTITY.settings.speakerBoost ? 'on' : 'off'}.
      </p>
      <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">{snapshot.message}</p>
      <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
        Monthly paid usage {snapshot.monthlyUsed} / {snapshot.monthlyLimit} characters.
      </p>

      <div className="grid gap-3">
        {snapshot.characters.map((character) => {
          const selectedCard = character.characterId === characterId;
          return (
            <button
              key={character.characterId}
              type="button"
              className={`rounded-2xl border p-3 text-left ${
                selectedCard
                  ? 'border-[var(--color-primary)] bg-[var(--color-success-soft)]'
                  : 'border-[var(--color-border)]'
              }`}
              onClick={() => {
                setCharacterId(character.characterId);
                setPreview(null);
                setError(null);
              }}
            >
              <h3 className="font-display text-lg font-semibold">{character.displayName}</h3>
              <p className="break-words text-sm leading-6">{character.personality.join(', ')}</p>
              <p className="break-words text-xs leading-5 text-[var(--color-text-muted)]">
                {character.delivery.join(', ')}
              </p>
            </button>
          );
        })}
      </div>

      <label className="block text-sm font-semibold">
        One dialogue line
        <textarea
          value={text}
          rows={3}
          maxLength={SCRIPT_TO_VOICE_MAX_CHARS}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
            setError(null);
          }}
          className="field-input mt-2 min-h-[5.5rem]"
        />
      </label>
      <p className="text-sm font-bold">
        Characters: {typedCount} / {SCRIPT_TO_VOICE_MAX_CHARS}
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

      <button
        type="button"
        className="btn-primary w-full px-4 text-sm"
        disabled={running}
        onClick={() => void reviewLine()}
      >
        {running && !preview ? 'Reviewing…' : 'Review line'}
      </button>

      {preview ? (
        <div className="space-y-3 rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-[var(--color-warning-foreground)]">
          <p className="font-bold">Confirm one paid preview-voice request</p>
          <p className="break-words text-sm leading-6">
            Character: {preview.displayName === 'Pip' || characterId === PIP_CHARACTER_ID ? 'Pip' : characterId === GOAT_CHARACTER_ID ? 'Goat' : preview.displayName}
          </p>
          <p className="break-words text-sm leading-6">Line: {preview.text}</p>
          <p className="text-sm font-bold">
            Characters: {preview.characterCount} / {SCRIPT_TO_VOICE_MAX_CHARS}
          </p>
          <p className="break-words text-sm leading-6">
            Model {VOICE_IDENTITY.model}. Output {VOICE_IDENTITY.outputFormat}. Stability{' '}
            {VOICE_IDENTITY.settings.stability}, similarity {VOICE_IDENTITY.settings.similarity}, style{' '}
            {VOICE_IDENTITY.settings.style}, speed {VOICE_IDENTITY.settings.speed}, speaker boost{' '}
            {VOICE_IDENTITY.settings.speakerBoost ? 'on' : 'off'}.
          </p>
          <p className="break-words text-sm leading-6">ElevenLabs will be contacted for this one request.</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-primary w-full px-4 text-sm"
              disabled={running || snapshot.locked}
              onClick={() => void generateOnce()}
            >
              {running ? 'Generating once…' : 'Generate once'}
            </button>
            <button
              type="button"
              className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
              disabled={running}
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <div className="space-y-2 rounded-2xl border border-[var(--color-border)] p-3">
          <p className="status-warning inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
            {receipt.label}
          </p>
          <p className="break-words text-sm leading-6">
            Receipt: {receipt.displayName}, {receipt.characterCount} characters, request {receipt.requestId}.
          </p>
          <audio controls src={receipt.audioDataUrl} className="w-full max-w-full" />
        </div>
      ) : null}

      {error ? <p className="break-words text-sm font-bold text-[var(--color-danger, #9b1c1c)]">{error}</p> : null}
    </section>
  );
}
