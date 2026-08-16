'use client';

import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewEmptyState, PreviewPageIntro } from './PreviewEmptyState';

export function PreviewRenderQueue() {
  const { workspace, message, busy, requestRender, reset } = usePreviewWorkspace();
  const episode = workspace.episodes[0] ?? null;
  const pathReady =
    workspace.settingsSaved &&
    Boolean(episode) &&
    workspace.assets.length > 0 &&
    workspace.voices.length > 0;

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Render Queue"
        title="Save a draft request"
        instruction="Preview can record a non-billable draft request only. It does not contact a GPU provider or invent progress, output files, or completion."
      />
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      {!episode ? (
        <PreviewEmptyState
          title="Create an episode first"
          body="This is step 7 of 7. A draft request needs an episode. Paid GPU and a real render stay blocked."
          href="/new-episode"
          actionLabel="Go to New Episode"
        />
      ) : !pathReady ? (
        <PreviewEmptyState
          title="Earlier steps are still open"
          body="Add an asset note and a voice note, then return here. You can still save a draft request, but the guided path marks this step blocked until those notes exist."
          href="/readiness"
          actionLabel="Review Readiness"
        />
      ) : workspace.renderRequests.length === 0 ? (
        <PreviewEmptyState
          title="No draft requests yet"
          body="Tap the button below to save a draft request. Nothing is rendered and no paid provider is contacted."
        />
      ) : null}
      <section className="studio-card space-y-3 p-4 sm:p-6">
        <p className="text-sm text-[var(--color-text-muted)]">
          A real render still needs a local studio database, approved canonical assets, theatrical
          binding, and paid-resource authorization. None of those are available here.
        </p>
        <button
          type="button"
          className="btn-primary w-full px-5 text-sm sm:w-auto"
          disabled={busy || !episode}
          onClick={() => episode && requestRender(episode.id)}
        >
          Create draft request — not rendered
        </button>
      </section>
      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-semibold">Requests</h2>
        {workspace.renderRequests.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No draft requests yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workspace.renderRequests.map((request) => (
              <li key={request.id} className="rounded-2xl border border-[var(--color-border)] p-4">
                <p className="font-semibold">{request.label}</p>
                <p className="break-words text-sm text-[var(--color-text-muted)]">
                  {request.status} · provider contacted: {String(request.contactedProvider)} ·
                  output: none · progress: none
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
