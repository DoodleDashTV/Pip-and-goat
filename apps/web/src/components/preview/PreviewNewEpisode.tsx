'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PreviewWorkspaceError } from '@/lib/preview-workspace/service';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';

export function PreviewNewEpisode() {
  const router = useRouter();
  const { workspace, message, busy, createEpisode, reset } = usePreviewWorkspace();
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">
          New Episode
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">Create a Preview episode</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-muted)]">
          Saved in this browser only. Classification is PREVIEW_NONCANONICAL. This does not create a
          production episode.
        </p>
      </header>
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      <form
        className="studio-card space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (submitted || busy) return;
          setSubmitted(true);
          const form = new FormData(event.currentTarget);
          try {
            const result = createEpisode({
              title: String(form.get('title') ?? ''),
              episodeNumber: Number(form.get('episodeNumber')),
              durationSec: Number(form.get('durationSec')),
              premise: String(form.get('premise') ?? ''),
            });
            router.push(`/workflow?episode=${result.episode.id}`);
          } catch (error) {
            setSubmitted(false);
            if (!(error instanceof PreviewWorkspaceError)) throw error;
          }
        }}
      >
        <label className="block text-sm font-semibold">
          Title
          <input name="title" required placeholder="Meadow Map Mystery" className="field-input mt-2" />
        </label>
        <label className="block text-sm font-semibold">
          Episode number
          <input name="episodeNumber" required type="number" min={1} defaultValue={1} className="field-input mt-2" />
        </label>
        <label className="block text-sm font-semibold">
          Duration
          <select name="durationSec" required defaultValue="30" className="field-input mt-2">
            {[15, 30, 45, 60].map((sec) => (
              <option key={sec} value={sec}>
                {sec} seconds
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Short premise
          <textarea
            name="premise"
            required
            rows={4}
            placeholder="A preview-only walk of the draft studio path."
            className="field-input mt-2"
          />
        </label>
        <button type="submit" disabled={busy || submitted} className="btn-primary px-5 py-3 text-sm">
          {busy || submitted ? 'Creating…' : 'Create Preview episode'}
        </button>
      </form>
      {workspace.episodes.length ? (
        <section className="studio-card p-6">
          <h2 className="font-display text-2xl font-semibold">Existing Preview episodes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {workspace.episodes.map((episode) => (
              <li key={episode.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--color-border)] py-2">
                <span>
                  E{episode.episodeNumber} · {episode.title}
                </span>
                <span className="text-[var(--color-text-muted)]">{episode.currentStage}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
