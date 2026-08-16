'use client';

import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';

export function PreviewRenderQueue() {
  const { workspace, message, busy, requestRender, reset } = usePreviewWorkspace();
  const episode = workspace.episodes[0] ?? null;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">
          Render Queue
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">Draft render requests</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-muted)]">
          Preview can record a non-billable draft request only. It does not contact a GPU provider
          or invent progress, output files, or completion.
        </p>
      </header>
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      <section className="studio-card space-y-3 p-6">
        <p className="text-sm text-[var(--color-text-muted)]">
          A real render still needs a local studio database, approved canonical assets, theatrical
          binding, and paid-resource authorization. None of those are available here.
        </p>
        <button
          type="button"
          className="btn-primary px-5 py-3 text-sm"
          disabled={busy || !episode}
          onClick={() => episode && requestRender(episode.id)}
        >
          Create draft request — not rendered
        </button>
        {!episode ? (
          <p className="text-sm text-[var(--color-text-muted)]">Create a Preview episode first.</p>
        ) : null}
      </section>
      <section className="studio-card p-6">
        <h2 className="font-display text-2xl font-semibold">Requests</h2>
        {workspace.renderRequests.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No draft requests yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workspace.renderRequests.map((request) => (
              <li key={request.id} className="rounded-2xl border border-[var(--color-border)] p-4">
                <p className="font-semibold">{request.label}</p>
                <p className="text-sm text-[var(--color-text-muted)]">
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
