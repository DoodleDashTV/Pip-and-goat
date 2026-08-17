'use client';

import { useEffect, useMemo, useState } from 'react';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewPageIntro } from './PreviewEmptyState';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import {
  applyLocalDecision,
  applyLocalEdit,
  buildLocalPackage,
  playbackOrFixture,
  readVoiceBrowserSession,
  writeVoiceBrowserSession,
  type BrowserVoiceLine,
} from '@/lib/voice-production/client-session';
import { evaluateVoiceProgress, FINAL_RENDER_LOCKED_REASON } from '@/lib/voice-production/progress';
import {
  isSampleVoiceEpisode,
  SAMPLE_VOICE_HREF,
  SAMPLE_VOICE_SCENE_LABEL,
} from '@/lib/voice-production/sample-episode';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, type RegisteredCharacterId } from '@/lib/voice-production/types';

type PublicLine = BrowserVoiceLine & { characterId: RegisteredCharacterId };

type SafetyInfo = {
  paidGenerationStatus: string;
  monthlyUsed: number;
  monthlyLimit: number;
  maxCharsPerRequest: number;
};

const EMOTIONS = ['curious wonder', 'playful loyalty', 'gentle excitement', 'careful', 'cheerful'];

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
  const {
    workspace,
    hydrated,
    busy,
    message,
    reset,
    exportBackup,
    importBackup,
    createSampleVoiceEpisode,
  } = usePreviewWorkspace();
  const episode = workspace.episodes[0] ?? null;
  const [lines, setLines] = useState<PublicLine[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PublicLine>>({});
  const [playback, setPlayback] = useState<Record<string, string>>({});
  const [safety, setSafety] = useState<SafetyInfo>({
    paidGenerationStatus: 'disabled',
    monthlyUsed: 0,
    monthlyLimit: 20000,
    maxCharsPerRequest: 280,
  });
  const [localMessage, setLocalMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  function remember(nextLines: PublicLine[], nextPlayback: Record<string, string>) {
    setLines(nextLines);
    setDrafts(Object.fromEntries(nextLines.map((line) => [line.id, line])));
    setPlayback(nextPlayback);
    if (episode) {
      writeVoiceBrowserSession({ episodeId: episode.id, lines: nextLines, playback: nextPlayback });
    }
  }

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

  useEffect(() => {
    if (!episode || !isSampleVoiceEpisode(episode)) return;
    const persisted = readVoiceBrowserSession(episode.id);
    if (persisted?.lines.length) {
      setLines(persisted.lines as PublicLine[]);
      setDrafts(Object.fromEntries(persisted.lines.map((line) => [line.id, line as PublicLine])));
      setPlayback(persisted.playback ?? {});
    }
    void postVoice({ action: 'create-sample-scene', episodeId: episode.id })
      .then((data) => {
        const nextLines = (data.lines ?? []) as PublicLine[];
        const nextPlayback = { ...(persisted?.playback ?? {}), ...(data.playback ?? {}) };
        remember(nextLines, nextPlayback);
      })
      .catch((error: unknown) => {
        if (persisted?.lines.length) return;
        setLocalMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Sample scene could not load.',
        });
      });
    // remember is local and episode-scoped; avoid retriggering on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id]);

  const progress = useMemo(() => evaluateVoiceProgress(lines), [lines]);
  const packageReady = lines.some((line) => line.approvalStatus === 'APPROVED');

  function patchDraft(lineId: string, patch: Partial<PublicLine>) {
    setDrafts((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }));
  }

  async function createSample() {
    try {
      createSampleVoiceEpisode();
      setLocalMessage({
        tone: 'ok',
        text: `Sample Voice Episode created. You are in the Voice Production workflow at ${SAMPLE_VOICE_HREF}.`,
      });
    } catch (error) {
      setLocalMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Sample episode could not be created.',
      });
    }
  }

  function replaceLine(previousId: string, next: PublicLine, nextPlayback?: string) {
    const nextLines = lines.some((item) => item.id === next.id)
      ? lines.map((item) => (item.id === previousId || item.id === next.id ? next : item))
      : [...lines.filter((item) => item.id !== previousId), next];
    const nextMap = { ...playback };
    if (previousId !== next.id) delete nextMap[previousId];
    if (nextPlayback) nextMap[next.id] = nextPlayback;
    remember(nextLines, nextMap);
  }

  async function generateLine(line: PublicLine) {
    const draft = drafts[line.id] ?? line;
    try {
      const sameText = draft.dialogueText === line.dialogueText && Boolean(playback[line.id]);
      const data = sameText
        ? await postVoice({ action: 'regenerate', lineId: line.id }).catch(() =>
            postVoice({
              action: 'generate-draft-audio',
              episodeId: line.episodeId,
              sceneId: line.sceneId,
              characterId: line.characterId,
              dialogueText: draft.dialogueText,
              performanceDirection: draft.performanceDirection,
              pronunciationNotes: draft.pronunciationNotes,
              emotion: draft.emotion,
            }),
          )
        : await postVoice({
            action: 'generate-draft-audio',
            episodeId: line.episodeId,
            sceneId: line.sceneId,
            characterId: line.characterId,
            dialogueText: draft.dialogueText,
            performanceDirection: draft.performanceDirection,
            pronunciationNotes: draft.pronunciationNotes,
            emotion: draft.emotion,
          });
      replaceLine(line.id, data.line, data.playbackDataUrl ?? playbackOrFixture(playback[data.line.id]));
      setLocalMessage({
        tone: 'ok',
        text: `Preview fixture ready. Provider contacted: ${data.line.providerContacted ? 'true' : 'false'}`,
      });
    } catch (error) {
      setLocalMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Fixture generation refused.',
      });
    }
  }

  async function saveEdits(line: PublicLine, patch?: Partial<PublicLine>) {
    const draft = { ...(drafts[line.id] ?? line), ...patch };
    try {
      const data = await postVoice({
        action: 'update-line',
        lineId: line.id,
        dialogueText: draft.dialogueText,
        performanceDirection: draft.performanceDirection,
        pronunciationNotes: draft.pronunciationNotes,
        emotion: draft.emotion,
      });
      replaceLine(line.id, data.line, playback[line.id]);
      setLocalMessage({ tone: 'ok', text: 'Dialogue saved within character limits.' });
    } catch (error) {
      try {
        const next = applyLocalEdit(line, draft, safety.maxCharsPerRequest) as PublicLine;
        replaceLine(line.id, next, playback[line.id]);
        setLocalMessage({ tone: 'ok', text: 'Dialogue saved in this browser within character limits.' });
      } catch (localError) {
        setLocalMessage({
          tone: 'error',
          text: localError instanceof Error ? localError.message : error instanceof Error ? error.message : 'Edit refused.',
        });
      }
    }
  }

  async function decide(lineId: string, decision: 'APPROVE' | 'REJECT') {
    const current = lines.find((line) => line.id === lineId);
    if (!current) return;
    try {
      const data = await postVoice({ action: 'decide', lineId, decision });
      replaceLine(lineId, data.line, playback[lineId]);
    } catch {
      replaceLine(lineId, applyLocalDecision(current, decision) as PublicLine, playback[lineId]);
    }
    setLocalMessage({
      tone: 'ok',
      text: decision === 'APPROVE' ? 'Line approved for later lip sync.' : 'Line rejected and excluded from the package.',
    });
  }

  async function downloadPackage() {
    if (!episode) return;
    let pack;
    try {
      const data = await postVoice({ action: 'package', episodeId: episode.id });
      pack = data.pack;
    } catch {
      pack = buildLocalPackage(episode.id, lines);
    }
    const blob = new Blob([`${JSON.stringify(pack, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tivvlejoy-voice-package.json';
    link.click();
    URL.revokeObjectURL(url);
    setLocalMessage({ tone: 'ok', text: 'Approved test package downloaded. Rejected lines were excluded.' });
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Voice Production"
        title="Pip and Goat draft voices"
        instruction="Create a sample episode, play fixture audio, edit lines, and approve a test package. Paid ElevenLabs stays disabled."
      />
      <PreviewBanner
        busy={busy}
        onReset={() => reset()}
        onExport={() => exportBackup()}
        onImport={(text, byteLength, confirm) => importBackup(text, byteLength, confirm)}
      />
      <PreviewMessage message={localMessage ?? message} />

      <section className="studio-card space-y-3 overflow-x-hidden p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Progress</h2>
        <ol className="grid grid-cols-2 gap-2">
          {progress.steps.map((step) => (
            <li
              key={step.label}
              className={`min-h-touch rounded-2xl border px-3 py-3 text-sm font-bold leading-5 ${
                step.active
                  ? 'border-[var(--color-primary)] bg-[var(--color-success-soft)] text-[var(--color-success-foreground)]'
                  : step.complete
                    ? 'border-[var(--color-border)] bg-[var(--color-surface-subtle)]'
                    : 'border-[var(--color-border)]'
              }`}
            >
              {step.label}
            </li>
          ))}
        </ol>
        <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
          Current step: {progress.current}. Draft → Review → Approved → Package Ready.
        </p>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Paid generation status</h2>
        <p className="status-error inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
          Paid voice generation: Disabled
        </p>
        <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
          Provider contacted: false. Preview fixtures only.
          {publicPreview ? ' This public Preview does not load any voice-provider secret.' : ''}
        </p>
        <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">{FINAL_RENDER_LOCKED_REASON}</p>
        <dl className="grid gap-3">
          <div className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-3 text-[var(--color-warning-foreground)]">
            <dt className="text-xs font-bold uppercase tracking-[0.14em]">Monthly paid usage</dt>
            <dd className="mt-1 text-sm font-bold">
              {safety.monthlyUsed} / {safety.monthlyLimit} characters
            </dd>
          </div>
        </dl>
      </section>

      {!hydrated ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading this browser&apos;s preview workspace…</p>
      ) : !episode ? (
        <section className="studio-card space-y-3 p-4 sm:p-5">
          <h2 className="font-display text-xl font-semibold">Create Sample Voice Episode</h2>
          <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
            Makes one short original meadow scene with a Pip line and a Goat line. No API key, database,
            or paid generation is required. Stays on {SAMPLE_VOICE_HREF}.
          </p>
          <button type="button" className="btn-primary w-full px-4 text-sm" disabled={busy} onClick={() => void createSample()}>
            Create Sample Voice Episode
          </button>
        </section>
      ) : (
        <section className="studio-card space-y-3 overflow-x-hidden p-4 sm:p-5">
          <h2 className="font-display text-xl font-semibold">Sample scene</h2>
          <p className="break-words text-sm font-bold">{episode.title}</p>
          <p className="break-words text-sm text-[var(--color-text-muted)]">{SAMPLE_VOICE_SCENE_LABEL}</p>
        </section>
      )}

      {lines.map((line) => {
        const draft = drafts[line.id] ?? line;
        const overLimit = Array.from(draft.dialogueText ?? '').length > safety.maxCharsPerRequest;
        return (
          <section key={line.id} className="studio-card space-y-3 overflow-x-hidden p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
              {line.characterId === PIP_CHARACTER_ID ? 'Pip' : 'Goat'} · {line.voiceProfileVersion}
            </p>
            <p className="status-warning inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
              Preview fixture — not the final Pip/Goat voice.
            </p>
            <label className="block text-sm font-semibold">
              Dialogue
              <textarea
                rows={4}
                value={draft.dialogueText}
                onChange={(event) => patchDraft(line.id, { dialogueText: event.target.value })}
                onBlur={() => void saveEdits(line)}
                className="field-input mt-2"
              />
            </label>
            <p className="text-sm text-[var(--color-text-muted)]">
              {Array.from(draft.dialogueText ?? '').length} / {safety.maxCharsPerRequest} characters
              {overLimit ? ' — over the per-request limit' : ''}
            </p>
            <label className="block text-sm font-semibold">
              Emotion / delivery
              <select
                className="field-input mt-2"
                value={EMOTIONS.includes(draft.emotion) ? draft.emotion : EMOTIONS[0]}
                onChange={(event) => {
                  patchDraft(line.id, { emotion: event.target.value });
                  void saveEdits(line, { emotion: event.target.value });
                }}
              >
                {EMOTIONS.map((emotion) => (
                  <option key={emotion} value={emotion}>
                    {emotion}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Performance direction
              <textarea
                rows={3}
                value={draft.performanceDirection}
                onChange={(event) => patchDraft(line.id, { performanceDirection: event.target.value })}
                onBlur={() => void saveEdits(line)}
                className="field-input mt-2"
              />
            </label>
            <label className="block text-sm font-semibold">
              Pronunciation notes
              <textarea
                rows={2}
                value={draft.pronunciationNotes}
                onChange={(event) => patchDraft(line.id, { pronunciationNotes: event.target.value })}
                onBlur={() => void saveEdits(line)}
                className="field-input mt-2"
              />
            </label>
            {playback[line.id] ? (
              <div className="space-y-2">
                <p className="text-sm font-bold">Play fixture</p>
                <audio controls src={playback[line.id]} className="w-full max-w-full" />
              </div>
            ) : null}
            <p className="text-sm text-[var(--color-text-muted)]">
              {line.approvalStatus} · provider contacted: {line.providerContacted ? 'true' : 'false'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn-primary w-full px-4 text-sm"
                disabled={overLimit}
                onClick={() => void generateLine(line)}
              >
                {playback[line.id] ? 'Regenerate fixture draft' : 'Generate fixture draft'}
              </button>
              <button
                type="button"
                className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
                onClick={() => void decide(line.id, 'APPROVE')}
              >
                Approve
              </button>
              <button
                type="button"
                className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
                onClick={() => void decide(line.id, 'REJECT')}
              >
                Reject
              </button>
            </div>
          </section>
        );
      })}

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <button
          type="button"
          className="btn-primary w-full px-4 text-sm"
          disabled={!packageReady}
          onClick={() => void downloadPackage()}
        >
          Download approved episode audio package
        </button>
      </section>
    </div>
  );
}
