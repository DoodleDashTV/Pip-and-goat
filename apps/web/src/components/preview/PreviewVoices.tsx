'use client';

import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewEmptyState, PreviewPageIntro } from './PreviewEmptyState';

export function PreviewVoices() {
  const { workspace, message, busy, saveVoice, reset, exportBackup, importBackup } =
    usePreviewWorkspace();
  const hasEpisode = workspace.episodes.length > 0;

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Voices"
        title="Add a Preview voice note"
        instruction="Save a character label and a display name. This is not a provider voice ID. Audition generation stays disabled."
      />
      <PreviewBanner
        busy={busy}
        onReset={() => reset()}
        onExport={() => exportBackup()}
        onImport={(text, byteLength, confirm) => importBackup(text, byteLength, confirm)}
      />
      <PreviewMessage message={message} />
      {!hasEpisode ? (
        <PreviewEmptyState
          title="Create an episode first"
          body="Voice notes belong to the Preview episode from step 2. Paid ElevenLabs stays blocked."
          href="/new-episode"
          actionLabel="Go to New Episode"
        />
      ) : workspace.voices.length === 0 ? (
        <PreviewEmptyState
          title="No Preview voice profiles yet"
          body="This is step 4 of 7. Add a label such as “Preview occupant A.” No audio is generated."
        />
      ) : null}
      <form
        className="studio-card space-y-4 p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          saveVoice({
            characterLabel: String(form.get('characterLabel') ?? ''),
            displayName: String(form.get('displayName') ?? ''),
            notes: String(form.get('notes') ?? ''),
          });
          event.currentTarget.reset();
        }}
      >
        <label className="block text-sm font-semibold">
          Character label
          <input name="characterLabel" required placeholder="Preview occupant A" className="field-input mt-2" />
        </label>
        <label className="block text-sm font-semibold">
          Voice display name
          <input name="displayName" required placeholder="Warm narrator (preview)" className="field-input mt-2" />
        </label>
        <label className="block text-sm font-semibold">
          Notes
          <textarea name="notes" rows={3} className="field-input mt-2" />
        </label>
        <button type="submit" disabled={busy} className="btn-primary w-full px-5 text-sm sm:w-auto">
          Save Preview voice profile
        </button>
      </form>
      <section className="studio-card space-y-3 p-4 sm:p-6">
        <h2 className="font-display text-2xl font-semibold">Audition generation</h2>
        <button type="button" disabled className="btn-primary w-full px-5 text-sm sm:w-auto" aria-disabled="true">
          Generate audition — unavailable
        </button>
        <p className="text-sm text-[var(--color-text-muted)]">
          Disabled. No voice provider is configured on this Preview. This control does not invent a
          voice ID or audio file.
        </p>
      </section>
      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-semibold">Saved profiles</h2>
        {workspace.voices.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No Preview voice profiles yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workspace.voices.map((voice) => (
              <li key={voice.id} className="rounded-2xl border border-[var(--color-border)] p-4">
                <p className="break-words font-semibold">{voice.displayName}</p>
                <p className="break-words text-sm text-[var(--color-text-muted)]">
                  {voice.characterLabel} · provider voice ID: none · audition: unavailable
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
