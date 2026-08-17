'use client';

import { useSearchParams } from 'next/navigation';
import { FOUNDATION_STAGE_LABEL, PREVIEW_DRAFT_STAGES } from '@/lib/preview-workspace/types';
import { canAdvancePreviewStage } from '@/lib/preview-workspace/service';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewEmptyState, PreviewPageIntro } from './PreviewEmptyState';

export function PreviewWorkflow() {
  const params = useSearchParams();
  const { workspace, message, busy, advanceEpisode, reset } = usePreviewWorkspace();
  const requested = params.get('episode');
  const episode =
    workspace.episodes.find((item) => item.id === requested) ?? workspace.episodes[0] ?? null;
  const decision = episode ? canAdvancePreviewStage(workspace, episode) : null;

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Episode Workflow"
        title="Walk the draft stages"
        instruction="Advance one draft stage at a time. Final render, theatrical, and publishing stay closed. This is not a production render."
      />
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      <section className="studio-card grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
        <p>Stage: {FOUNDATION_STAGE_LABEL}</p>
        <p>Theatrical gate: Closed</p>
        <p>Steps 9–16: Closed</p>
        <p>Paid GPU: Not authorized</p>
      </section>
      {!episode ? (
        <PreviewEmptyState
          title="No Preview episode to walk"
          body="This is step 5 of 7. Create an episode first, then come back here to move through the draft stages."
          href="/new-episode"
          actionLabel="Go to New Episode"
        />
      ) : (
        <>
          <section className="studio-card space-y-2 p-4 sm:p-6">
            <h2 className="break-words font-display text-2xl font-semibold">{episode.title}</h2>
            <p className="break-words text-sm text-[var(--color-text-muted)]">
              E{episode.episodeNumber} · {episode.durationSec}s · {episode.classification}
            </p>
            <p className="text-sm">{episode.premise}</p>
          </section>
          <section className="studio-card p-4 sm:p-6">
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
                    <span className="min-w-0 break-all font-mono text-xs">
                      {stage}
                      {current ? ' · current' : ''}
                    </span>
                    <span className={done ? 'status-success shrink-0 rounded-full px-2 py-0.5' : 'status-warning shrink-0 rounded-full px-2 py-0.5'}>
                      {done ? 'DONE' : current ? 'CURRENT' : 'WAITING'}
                    </span>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              className="btn-primary mt-4 w-full px-5 text-sm sm:w-auto"
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
