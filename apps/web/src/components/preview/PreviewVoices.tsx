'use client';

import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';

export function PreviewVoices() {
  const { workspace, message, busy, saveVoice, reset } = usePreviewWorkspace();

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">
          Voice Setup
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">Preview voice profiles</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-muted)]">
          Save editable metadata only. A saved profile is not a provider voice ID. Audition
          generation stays disabled because no credentials are configured.
        </p>
      </header>
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      <form
        className="studio-card space-y-4 p-6"
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
        <button type="submit" disabled={busy} className="btn-primary px-5 py-3 text-sm">
          Save Preview voice profile
        </button>
      </form>
      <section className="studio-card space-y-3 p-6">
        <h2 className="font-display text-2xl font-semibold">Audition generation</h2>
        <button type="button" disabled className="btn-primary px-5 py-3 text-sm" aria-disabled="true">
          Generate audition — unavailable
        </button>
        <p className="text-sm text-[var(--color-text-muted)]">
          Disabled. No voice provider is configured on this Preview. This control does not invent a
          voice ID or audio file.
        </p>
      </section>
      <section className="studio-card p-6">
        <h2 className="font-display text-2xl font-semibold">Saved profiles</h2>
        {workspace.voices.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No Preview voice profiles yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workspace.voices.map((voice) => (
              <li key={voice.id} className="rounded-2xl border border-[var(--color-border)] p-4">
                <p className="font-semibold">{voice.displayName}</p>
                <p className="text-sm text-[var(--color-text-muted)]">
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
