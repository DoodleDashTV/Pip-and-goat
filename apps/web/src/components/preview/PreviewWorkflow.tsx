'use client';

import { useSearchParams } from 'next/navigation';
import { PREVIEW_DRAFT_STAGES } from '@/lib/preview-workspace/types';
import { canAdvancePreviewStage } from '@/lib/preview-workspace/service';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';

export function PreviewWorkflow() {
  const params = useSearchParams();
  const { workspace, message, busy, advanceEpisode, reset } = usePreviewWorkspace();
  const requested = params.get('episode');
  const episode =
    workspace.episodes.find((item) => item.id === requested) ?? workspace.episodes[0] ?? null;
  const decision = episode ? canAdvancePreviewStage(workspace, episode) : null;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">
          Episode Workflow
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">Preview draft walk</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-muted)]">
          Loads the episode you created. Only draft stages can advance. Final render, theatrical,
          and publishing stay closed.
        </p>
      </header>
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      <section className="studio-card grid gap-3 p-5 sm:grid-cols-2">
        <p>Stage: DDP_STEPS_1_8</p>
        <p>Theatrical gate: Closed</p>
        <p>Steps 9–16: Closed</p>
        <p>Paid GPU: Not authorized</p>
      </section>
      {!episode ? (
        <section className="studio-card p-6">
          <p className="status-warning inline-flex min-h-touch items-center gap-2 rounded-full px-3 py-2 text-sm font-bold">
            <span aria-hidden="true">!</span>
            <span>Create a Preview episode first.</span>
          </p>
        </section>
      ) : (
        <>
          <section className="studio-card space-y-2 p-6">
            <h2 className="font-display text-2xl font-semibold">{episode.title}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              E{episode.episodeNumber} · {episode.durationSec}s · {episode.classification}
            </p>
            <p className="text-sm">{episode.premise}</p>
          </section>
          <section className="studio-card p-6">
            <h2 className="font-display text-xl font-semibold">Draft stages</h2>
            <ol className="mt-3 space-y-2">
              {PREVIEW_DRAFT_STAGES.map((stage) => {
                const done = episode.completedStages.includes(stage);
                const current = episode.currentStage === stage;
                return (
                  <li
                    key={stage}
                    className="flex min-h-touch items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs">
                      {stage}
                      {current ? ' · current' : ''}
                    </span>
                    <span className={done ? 'status-success rounded-full px-2 py-0.5' : 'status-warning rounded-full px-2 py-0.5'}>
                      {done ? 'DONE' : current ? 'CURRENT' : 'WAITING'}
                    </span>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              className="btn-primary mt-4 px-5 py-3 text-sm"
              disabled={busy || !decision?.allowed}
              onClick={() => advanceEpisode(episode.id)}
            >
              {decision?.allowed ? `Advance to ${decision.nextStage}` : 'Advance blocked'}
            </button>
            {decision && !decision.allowed ? (
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">{decision.reason}</p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
