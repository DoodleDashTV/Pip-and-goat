'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PreviewWorkspaceError } from '@/lib/preview-workspace/service';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewEmptyState, PreviewPageIntro } from './PreviewEmptyState';

export function PreviewNewEpisode() {
  const router = useRouter();
  const { workspace, message, busy, createEpisode, reset } = usePreviewWorkspace();
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PreviewPageIntro
        kicker="New Episode"
        title="Create a Preview episode"
        instruction="Give the episode a title and a short premise. This creates a browser-only record. It is not a production episode."
      />
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      {!workspace.settingsSaved ? (
        <PreviewEmptyState
          title="Production Setup is not saved yet"
          body="Save a project name on Production Setup first. You can still draft an episode here, but the guided path marks this step blocked until setup is saved."
          href="/production-setup"
          actionLabel="Go to Production Setup"
        />
      ) : null}
      {workspace.settingsSaved && workspace.episodes.length === 0 ? (
        <PreviewEmptyState
          title="No episode yet"
          body="This is step 2 of 7. Fill in the form below, then tap Create Preview episode. After that you can add assets and voices."
        />
      ) : null}
      <form
        className="studio-card space-y-4 p-4 sm:p-6"
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
        <button type="submit" disabled={busy || submitted} className="btn-primary w-full px-5 text-sm sm:w-auto">
          {busy || submitted ? 'Creating…' : 'Create Preview episode'}
        </button>
      </form>
      {workspace.episodes.length ? (
        <section className="studio-card p-4 sm:p-6">
          <h2 className="font-display text-2xl font-semibold">Existing Preview episodes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {workspace.episodes.map((episode) => (
              <li
                key={episode.id}
                className="flex min-h-touch flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] py-2"
              >
                <span className="min-w-0 break-words">
                  E{episode.episodeNumber} · {episode.title}
                </span>
                <span className="break-all text-[var(--color-text-muted)]">{episode.currentStage}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
