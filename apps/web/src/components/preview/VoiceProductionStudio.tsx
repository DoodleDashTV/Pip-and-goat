'use client';

import { useEffect, useMemo, useState } from 'react';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewEmptyState, PreviewPageIntro } from './PreviewEmptyState';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { generateOriginalDialogue } from '@/lib/voice-production/dialogue';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, type RegisteredCharacterId } from '@/lib/voice-production/types';

type PublicLine = {
  id: string;
  episodeId: string;
  sceneId: string;
  characterId: RegisteredCharacterId;
  voiceProfileVersion: string;
  dialogueText: string;
  performanceDirection: string;
  pronunciationNotes: string;
  emotion: string;
  generationStatus: string;
  approvalStatus: string;
  audioObjectKey: string | null;
  characterCount: number;
  providerContacted: boolean;
};

type SafetyInfo = {
  paidGenerationStatus: string;
  monthlyUsed: number;
  monthlyLimit: number;
  maxCharsPerRequest: number;
};

const SCENES = [
  { id: 'scene-1', label: 'Scene 1 — Meadow open' },
  { id: 'scene-2', label: 'Scene 2 — Map clue' },
  { id: 'scene-3', label: 'Scene 3 — Path choice' },
];

async function postVoice(body: Record<string, unknown>) {
  const res = await fetch('/api/voice-production', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? 'Voice production refused.');
  }
  return data;
}

export function VoiceProductionStudio({ publicPreview }: { publicPreview: boolean }) {
  const { workspace, hydrated, busy, message, reset, exportBackup, importBackup } = usePreviewWorkspace();
  const episode = workspace.episodes[0] ?? null;
  const [characterId, setCharacterId] = useState<RegisteredCharacterId>(PIP_CHARACTER_ID);
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  const [dialogue, setDialogue] = useState('');
  const [emotion, setEmotion] = useState('');
  const [direction, setDirection] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [lines, setLines] = useState<PublicLine[]>([]);
  const [playback, setPlayback] = useState<string | null>(null);
  const [safety, setSafety] = useState<SafetyInfo>({
    paidGenerationStatus: 'disabled',
    monthlyUsed: 0,
    monthlyLimit: 20000,
    maxCharsPerRequest: 280,
  });
  const [localMessage, setLocalMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void fetch('/api/voice-production')
      .then((res) => res.json())
      .then((data) => {
        setSafety({
          paidGenerationStatus: data.paidGenerationStatus ?? 'disabled',
          monthlyUsed: data.safety?.ledger?.paidCharactersUsed ?? 0,
          monthlyLimit: data.safety?.monthlyCharLimit ?? 20000,
          maxCharsPerRequest: data.safety?.maxCharsPerRequest ?? 280,
        });
      })
      .catch(() => undefined);
  }, []);

  const estimate = useMemo(() => Array.from(dialogue).length, [dialogue]);

  function writeDraft() {
    if (!episode) return;
    const draft = generateOriginalDialogue({
      characterId,
      episodeId: episode.id,
      sceneId,
      premise: episode.premise,
    });
    setDialogue(draft.text);
    setEmotion(draft.emotion);
    setDirection(draft.performanceDirection);
    setPronunciation(draft.pronunciationNotes);
    setLocalMessage({ tone: 'ok', text: 'Original draft dialogue written. No provider was contacted.' });
  }

  async function generateAudio() {
    if (!episode) return;
    try {
      const data = await postVoice({
        action: 'generate-draft-audio',
        episodeId: episode.id,
        sceneId,
        characterId,
        dialogueText: dialogue,
        performanceDirection: direction,
        pronunciationNotes: pronunciation,
        emotion,
      });
      setLines((current) => [data.line, ...current.filter((line) => line.id !== data.line.id)]);
      setPlayback(data.playbackDataUrl ?? null);
      setLocalMessage({
        tone: 'ok',
        text: data.line.providerContacted
          ? 'Provider contacted: true'
          : 'Draft fixture audio ready. Provider contacted: false',
      });
    } catch (error) {
      setLocalMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Voice generation refused.',
      });
    }
  }

  async function decide(lineId: string, decision: 'APPROVE' | 'REJECT') {
    const data = await postVoice({ action: 'decide', lineId, decision });
    setLines((current) => current.map((line) => (line.id === lineId ? data.line : line)));
    setLocalMessage({ tone: 'ok', text: decision === 'APPROVE' ? 'Line approved for later lip sync.' : 'Line rejected.' });
  }

  async function regenerate(lineId: string) {
    const data = await postVoice({ action: 'regenerate', lineId });
    setLines((current) => [data.line, ...current.filter((line) => line.id !== lineId)]);
    setPlayback(data.playbackDataUrl ?? null);
    setLocalMessage({ tone: 'ok', text: 'Line regenerated from fixtures. Provider contacted: false' });
  }

  async function downloadPackage() {
    if (!episode) return;
    const data = await postVoice({ action: 'package', episodeId: episode.id });
    const blob = new Blob([`${JSON.stringify(data.pack, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tivvlejoy-voice-package.json';
    link.click();
    URL.revokeObjectURL(url);
    setLocalMessage({ tone: 'ok', text: 'Approved episode audio package downloaded. No secrets included.' });
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Voice Production"
        title="Pip and Goat draft voices"
        instruction="Write original dialogue, assign Pip or Goat, and generate fixture draft audio. Paid ElevenLabs stays disabled until Justin authorizes it."
      />
      <PreviewBanner
        busy={busy}
        onReset={() => reset()}
        onExport={() => exportBackup()}
        onImport={(text, byteLength, confirm) => importBackup(text, byteLength, confirm)}
      />
      <PreviewMessage message={localMessage ?? message} />

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Paid generation status</h2>
        <p className="status-error inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
          Paid voice generation: {safety.paidGenerationStatus === 'disabled' ? 'Disabled' : 'Not used'}
        </p>
        <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
          Provider contacted: false. Preview and test modes use fixtures. Browser Voice IDs are rejected.
          {publicPreview ? ' This public Preview does not load any voice-provider secret.' : ''}
        </p>
        <dl className="grid gap-3">
          <div className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-3 text-[var(--color-warning-foreground)]">
            <dt className="text-xs font-bold uppercase tracking-[0.14em]">Usage estimate</dt>
            <dd className="mt-1 text-sm font-bold">
              {estimate} / {safety.maxCharsPerRequest} characters this line
            </dd>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] px-3 py-3">
            <dt className="text-xs font-bold uppercase tracking-[0.14em]">Current monthly paid usage</dt>
            <dd className="mt-1 text-sm font-bold">
              {safety.monthlyUsed} / {safety.monthlyLimit} characters
            </dd>
          </div>
        </dl>
      </section>

      {!hydrated ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading this browser&apos;s preview workspace…</p>
      ) : !episode ? (
        <PreviewEmptyState
          title="Create an episode first"
          body="Voice Production needs a Preview episode so lines can be assigned to a scene."
          href="/new-episode"
          actionLabel="Go to New Episode"
        />
      ) : (
        <form
          className="studio-card space-y-4 p-4 sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void generateAudio();
          }}
        >
          <label className="block text-sm font-semibold">
            Episode
            <input
              readOnly
              value={`${episode.title} · ${episode.id}`}
              className="field-input mt-2"
            />
          </label>
          <label className="block text-sm font-semibold">
            Scene
            <select
              className="field-input mt-2"
              value={sceneId}
              onChange={(event) => setSceneId(event.target.value)}
            >
              {SCENES.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Assign character</legend>
            <label className="flex min-h-touch items-center gap-2 text-sm">
              <input
                type="radio"
                name="character"
                checked={characterId === PIP_CHARACTER_ID}
                onChange={() => setCharacterId(PIP_CHARACTER_ID)}
              />
              Pip · CHAR_PIP_001 · pip_default_v1
            </label>
            <label className="flex min-h-touch items-center gap-2 text-sm">
              <input
                type="radio"
                name="character"
                checked={characterId === GOAT_CHARACTER_ID}
                onChange={() => setCharacterId(GOAT_CHARACTER_ID)}
              />
              Goat · CHAR_GOAT_001 · goat_default_v1
            </label>
          </fieldset>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-primary w-full px-4 text-sm sm:w-auto" onClick={writeDraft}>
              Write original dialogue
            </button>
          </div>
          <label className="block text-sm font-semibold">
            Original generated dialogue
            <textarea
              required
              rows={5}
              value={dialogue}
              onChange={(event) => setDialogue(event.target.value)}
              className="field-input mt-2"
            />
          </label>
          <label className="block text-sm font-semibold">
            Emotion / delivery
            <input value={emotion} onChange={(event) => setEmotion(event.target.value)} className="field-input mt-2" />
          </label>
          <label className="block text-sm font-semibold">
            Performance direction
            <textarea
              rows={3}
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
              className="field-input mt-2"
            />
          </label>
          <label className="block text-sm font-semibold">
            Pronunciation notes
            <textarea
              rows={2}
              value={pronunciation}
              onChange={(event) => setPronunciation(event.target.value)}
              className="field-input mt-2"
            />
          </label>
          <p className="text-sm text-[var(--color-text-muted)]">
            Voice profile used: {characterId === PIP_CHARACTER_ID ? 'pip_default_v1' : 'goat_default_v1'}
          </p>
          <button type="submit" className="btn-primary w-full px-4 text-sm sm:w-auto">
            Generate Draft Audio
          </button>
        </form>
      )}

      {playback ? (
        <section className="studio-card space-y-3 p-4 sm:p-5">
          <h2 className="font-display text-xl font-semibold">Audio playback</h2>
          <p className="text-sm text-[var(--color-text-muted)]">Fixture playback only. Not a paid ElevenLabs file.</p>
          <audio controls src={playback} className="w-full max-w-full" />
        </section>
      ) : null}

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Generated lines</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No draft lines yet. Manual approval is required for every line.</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((line) => (
              <li key={line.id} className="rounded-2xl border border-[var(--color-border)] p-3">
                <p className="break-words text-sm font-bold">
                  {line.characterId} · {line.voiceProfileVersion}
                </p>
                <p className="mt-1 break-words text-sm leading-6">{line.dialogueText}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {line.approvalStatus} · provider contacted: {line.providerContacted ? 'true' : 'false'}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-touch items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
                    onClick={() => void decide(line.id, 'APPROVE')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-touch items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
                    onClick={() => void decide(line.id, 'REJECT')}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-touch items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
                    onClick={() => void regenerate(line.id)}
                  >
                    Regenerate
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="btn-primary w-full px-4 text-sm sm:w-auto"
          disabled={!episode || lines.every((line) => line.approvalStatus !== 'APPROVED')}
          onClick={() => void downloadPackage()}
        >
          Download approved episode audio package
        </button>
      </section>
    </div>
  );
}
