'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewPageIntro } from './PreviewEmptyState';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import {
  applyLocalDecision,
  applyLocalEdit,
  buildLocalPackage,
  playbackOrFixture,
  persistableLines,
  readVoiceBrowserSession,
  writeVoiceBrowserSession,
  type BrowserVoiceLine,
} from '@/lib/voice-production/client-session';
import {
  actionTarget,
  applyFormPatch,
  createFormSnapshot,
  mergeRemoteLine,
  replaceLineKeepingOrder,
  sortVoiceLines,
  visibleFieldsForAction,
  type VoiceFormSnapshot,
} from '@/lib/voice-production/form-state';
import { evaluateVoiceProgress, FINAL_RENDER_LOCKED_REASON } from '@/lib/voice-production/progress';
import {
  isSampleVoiceEpisode,
  SAMPLE_VOICE_HREF,
  SAMPLE_VOICE_SCENE_LABEL,
} from '@/lib/voice-production/sample-episode';
import { PIP_CHARACTER_ID, type RegisteredCharacterId } from '@/lib/voice-production/types';

type PublicLine = BrowserVoiceLine & { characterId: RegisteredCharacterId; fixtureRevision?: string };

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
  const [forms, setForms] = useState<Record<string, VoiceFormSnapshot>>({});
  const [playback, setPlayback] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | null>>({});
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [safety, setSafety] = useState<SafetyInfo>({
    paidGenerationStatus: 'disabled',
    monthlyUsed: 0,
    monthlyLimit: 20000,
    maxCharsPerRequest: 280,
  });
  const [localMessage, setLocalMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const formsRef = useRef(forms);
  const linesRef = useRef(lines);
  const playbackRef = useRef(playback);
  const requestRef = useRef<Record<string, number>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  formsRef.current = forms;
  linesRef.current = lines;
  playbackRef.current = playback;

  function persist(nextLines: PublicLine[], nextPlayback: Record<string, string>) {
    const ordered = persistableLines(nextLines) as PublicLine[];
    linesRef.current = ordered;
    playbackRef.current = nextPlayback;
    setLines(ordered);
    setPlayback(nextPlayback);
    if (episode) {
      writeVoiceBrowserSession({ episodeId: episode.id, lines: ordered, playback: nextPlayback });
    }
  }

  function formFor(line: PublicLine): VoiceFormSnapshot {
    return (
      formsRef.current[line.characterId] ??
      createFormSnapshot({
        lineId: line.id,
        characterId: line.characterId,
        dialogueText: line.dialogueText,
        performanceDirection: line.performanceDirection,
        pronunciationNotes: line.pronunciationNotes,
        emotion: line.emotion,
      })
    );
  }

  function rememberLines(nextLines: PublicLine[], nextPlayback: Record<string, string>) {
    const ordered = sortVoiceLines(nextLines);
    setForms((current) => {
      const next = { ...current };
      for (const line of ordered) {
        const existing = current[line.characterId];
        next[line.characterId] = existing
          ? { ...existing, lineId: line.id }
          : createFormSnapshot({
              lineId: line.id,
              characterId: line.characterId,
              dialogueText: line.dialogueText,
              performanceDirection: line.performanceDirection,
              pronunciationNotes: line.pronunciationNotes,
              emotion: line.emotion,
            });
      }
      return next;
    });
    persist(ordered, nextPlayback);
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
      rememberLines(persisted.lines as PublicLine[], persisted.playback ?? {});
    }
    void postVoice({ action: 'create-sample-scene', episodeId: episode.id })
      .then((data) => {
        const nextLines = sortVoiceLines((data.lines ?? []) as PublicLine[]);
        const nextPlayback = { ...(persisted?.playback ?? {}), ...(data.playback ?? {}) };
        rememberLines(nextLines, nextPlayback);
      })
      .catch((error: unknown) => {
        if (persisted?.lines.length) return;
        setLocalMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Sample scene could not load.',
        });
      });
    // episode-scoped bootstrap only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id]);

  const orderedLines = useMemo(() => sortVoiceLines(lines), [lines]);
  const progress = useMemo(() => evaluateVoiceProgress(orderedLines), [orderedLines]);
  const packageReady = orderedLines.some((line) => line.approvalStatus === 'APPROVED');

  function markSaved(characterId: string) {
    setSaveStatus((current) => ({ ...current, [characterId]: 'saved' }));
    if (savedTimers.current[characterId]) clearTimeout(savedTimers.current[characterId]);
    savedTimers.current[characterId] = setTimeout(() => {
      setSaveStatus((current) => ({ ...current, [characterId]: null }));
    }, 1400);
  }

  function patchForm(line: PublicLine, patch: Partial<VoiceFormSnapshot>) {
    const current = formFor(line);
    const next = applyFormPatch(current, patch);
    formsRef.current = { ...formsRef.current, [line.characterId]: next };
    setForms(formsRef.current);
    setSaveStatus((status) => ({ ...status, [line.characterId]: 'saving' }));
    if (saveTimers.current[line.characterId]) clearTimeout(saveTimers.current[line.characterId]);
    saveTimers.current[line.characterId] = setTimeout(() => {
      void flushSave(line.characterId);
    }, 200);
  }

  async function flushSave(characterId: string) {
    if (saveTimers.current[characterId]) {
      clearTimeout(saveTimers.current[characterId]);
      delete saveTimers.current[characterId];
    }
    const line = linesRef.current.find((item) => item.characterId === characterId);
    const form = formsRef.current[characterId];
    if (!line || !form) return form;
    const fields = visibleFieldsForAction(form);
    const textChanged = fields.dialogueText !== line.dialogueText;
    try {
      const data = await postVoice({
        action: 'update-line',
        lineId: line.id,
        ...fields,
      });
      const incoming = data.line as PublicLine;
      applyIncoming(
        characterId,
        {
          ...incoming,
          approvalStatus: textChanged ? incoming.approvalStatus : line.approvalStatus,
          generationStatus: textChanged ? incoming.generationStatus : line.generationStatus,
        },
        form.revision,
      );
      markSaved(characterId);
    } catch {
      try {
        const next = applyLocalEdit(line, fields, safety.maxCharsPerRequest) as PublicLine;
        applyIncoming(
          characterId,
          {
            ...next,
            approvalStatus: textChanged ? next.approvalStatus : line.approvalStatus,
            generationStatus: textChanged ? next.generationStatus : line.generationStatus,
          },
          form.revision,
        );
        markSaved(characterId);
      } catch (error) {
        setLocalMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Edit refused.',
        });
      }
    }
    return formsRef.current[characterId];
  }

  function applyIncoming(characterId: string, incoming: PublicLine, localRevision: number) {
    const form = formsRef.current[characterId];
    const mergedFields = form
      ? mergeRemoteLine(form, { ...incoming, revision: incoming.fixtureRevision ? localRevision : -1 })
      : incoming;
    const nextLine = {
      ...incoming,
      dialogueText: mergedFields.dialogueText,
      performanceDirection: mergedFields.performanceDirection,
      pronunciationNotes: mergedFields.pronunciationNotes,
      emotion: mergedFields.emotion,
    } as PublicLine;
    if (form) {
      const kept = {
        ...form,
        lineId: nextLine.id,
        dialogueText: nextLine.dialogueText,
        performanceDirection: nextLine.performanceDirection,
        pronunciationNotes: nextLine.pronunciationNotes,
        emotion: nextLine.emotion,
      };
      formsRef.current = { ...formsRef.current, [characterId]: kept };
      setForms(formsRef.current);
    }
    const nextLines = replaceLineKeepingOrder(linesRef.current, { characterId, id: incoming.id }, nextLine);
    persist(nextLines as PublicLine[], playbackRef.current);
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

  async function generateLine(line: PublicLine) {
    const target = actionTarget(line);
    const seq = (requestRef.current[target.characterId] ?? 0) + 1;
    requestRef.current[target.characterId] = seq;
    setBusyCard(target.characterId);
    const form = (await flushSave(target.characterId)) ?? formFor(line);
    const fields = visibleFieldsForAction(form);
    try {
      const data = await postVoice({
        action: 'regenerate',
        lineId: form.lineId || line.id,
        ...fields,
      }).catch(() =>
        postVoice({
          action: 'generate-draft-audio',
          episodeId: line.episodeId,
          sceneId: line.sceneId,
          characterId: target.characterId,
          forceNew: true,
          ...fields,
        }),
      );
      if (requestRef.current[target.characterId] !== seq) return;
      const incoming = data.line as PublicLine;
      const nextPlayback = {
        ...playbackRef.current,
        [incoming.id]:
          data.playbackDataUrl ??
          playbackOrFixture(target.characterId, playbackRef.current[incoming.id], incoming.fixtureRevision),
      };
      if (incoming.id !== line.id) delete nextPlayback[line.id];
      playbackRef.current = nextPlayback;
      applyIncoming(target.characterId, incoming, form.revision);
      persist(
        replaceLineKeepingOrder(linesRef.current, target, {
          ...incoming,
          ...fields,
        } as PublicLine) as PublicLine[],
        nextPlayback,
      );
      setLocalMessage({
        tone: 'ok',
        text: `Playback test fixture ready. Provider contacted: ${incoming.providerContacted ? 'true' : 'false'}`,
      });
    } catch (error) {
      setLocalMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Fixture generation refused.',
      });
    } finally {
      if (requestRef.current[target.characterId] === seq) setBusyCard(null);
    }
  }

  async function decide(line: PublicLine, decision: 'APPROVE' | 'REJECT') {
    const target = actionTarget(line);
    await flushSave(target.characterId);
    const current = linesRef.current.find((item) => item.characterId === target.characterId);
    if (!current) return;
    setBusyCard(target.characterId);
    try {
      const data = await postVoice({ action: 'decide', lineId: current.id, decision });
      applyIncoming(target.characterId, data.line as PublicLine, formFor(current).revision);
    } catch {
      applyIncoming(target.characterId, applyLocalDecision(current, decision) as PublicLine, formFor(current).revision);
    } finally {
      setBusyCard(null);
    }
    setLocalMessage({
      tone: 'ok',
      text: decision === 'APPROVE' ? 'Line approved for later lip sync.' : 'Line rejected and excluded from the package.',
    });
  }

  async function downloadPackage() {
    if (!episode) return;
    await Promise.all(orderedLines.map((line) => flushSave(line.characterId)));
    const pack = buildLocalPackage(episode.id, sortVoiceLines(linesRef.current));
    try {
      await postVoice({ action: 'package', episodeId: episode.id });
    } catch {
      // Preview serverless memory may be empty; the downloaded package uses visible lines.
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
        instruction="Create a sample episode, play the playback-test chime, edit lines, and approve a test package. Paid ElevenLabs stays disabled."
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
          Provider contacted: false. Playback-test fixtures only.
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

      {orderedLines.map((line) => {
        const form = forms[line.characterId] ?? formFor(line);
        const overLimit = Array.from(form.dialogueText ?? '').length > safety.maxCharsPerRequest;
        const cardBusy = busyCard === line.characterId;
        const status = saveStatus[line.characterId];
        const audio = playback[line.id];
        return (
          <section
            key={line.characterId}
            data-character-id={line.characterId}
            data-line-id={line.id}
            className="studio-card space-y-3 overflow-x-hidden p-4 sm:p-5"
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
              {line.characterId === PIP_CHARACTER_ID ? 'Pip' : 'Goat'} · {line.voiceProfileVersion}
            </p>
            <p className="status-warning inline-flex min-h-touch items-center rounded-full px-3 py-2 text-sm font-bold">
              Playback test only — not Pip/Goat’s voice.
            </p>
            {status ? (
              <p className="text-sm font-bold text-[var(--color-success-foreground)]" aria-live="polite">
                {status === 'saving' ? 'Saving…' : 'Saved'}
              </p>
            ) : null}
            <label className="block text-sm font-semibold">
              Dialogue
              <textarea
                rows={4}
                value={form.dialogueText}
                onChange={(event) => patchForm(line, { dialogueText: event.target.value })}
                className="field-input mt-2"
              />
            </label>
            <p className="text-sm text-[var(--color-text-muted)]">
              {Array.from(form.dialogueText ?? '').length} / {safety.maxCharsPerRequest} characters
              {overLimit ? ' — over the per-request limit' : ''}
            </p>
            <label className="block text-sm font-semibold">
              Emotion / delivery
              <select
                className="field-input mt-2"
                value={EMOTIONS.includes(form.emotion) ? form.emotion : EMOTIONS[0]}
                onChange={(event) => patchForm(line, { emotion: event.target.value })}
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
                value={form.performanceDirection}
                onChange={(event) => patchForm(line, { performanceDirection: event.target.value })}
                className="field-input mt-2"
              />
            </label>
            <label className="block text-sm font-semibold">
              Pronunciation notes
              <textarea
                rows={2}
                value={form.pronunciationNotes}
                onChange={(event) => patchForm(line, { pronunciationNotes: event.target.value })}
                className="field-input mt-2"
              />
            </label>
            {audio ? (
              <div className="space-y-2">
                <p className="text-sm font-bold">Play playback-test chime</p>
                <audio
                  key={`${line.characterId}-${line.fixtureRevision ?? line.id}`}
                  controls
                  src={audio}
                  className="w-full max-w-full"
                />
                <p className="break-words text-xs text-[var(--color-text-muted)]">
                  Fixture revision {line.fixtureRevision ?? 'v1'}
                </p>
              </div>
            ) : null}
            <p className="text-sm text-[var(--color-text-muted)]">
              {line.approvalStatus} · provider contacted: {line.providerContacted ? 'true' : 'false'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn-primary w-full px-4 text-sm"
                disabled={overLimit || cardBusy}
                onClick={() => void generateLine(line)}
              >
                {audio ? 'Regenerate fixture draft' : 'Generate fixture draft'}
              </button>
              <button
                type="button"
                className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
                disabled={cardBusy}
                onClick={() => void decide(line, 'APPROVE')}
              >
                Approve
              </button>
              <button
                type="button"
                className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold"
                disabled={cardBusy}
                onClick={() => void decide(line, 'REJECT')}
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
          disabled={!packageReady || Boolean(busyCard)}
          onClick={() => void downloadPackage()}
        >
          Download approved episode audio package
        </button>
      </section>
    </div>
  );
}
