'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { PreviewPageIntro } from './PreviewEmptyState';
import { sampleBatchPlan, sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner';

export function EpisodeScenePlanner() {
  const plan = useMemo(() => sampleEpisodeWithKnownHashes(), []);
  const batch = useMemo(() => sampleBatchPlan(), []);

  return (
    <div className="space-y-4 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Episode Scene Planner"
        title="TivvleJoy episode scene planner"
        instruction="Planning only. No Blender render. No paid GPU. No commercial assets processed."
      />

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
          Audience Engagement Blueprint
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Research-informed Story Clarity and Replay Design sit after episode concept and before shot planning.
          This is not a guarantee of virality.
        </p>
        <p className="text-sm">
          <Link href="/audience-engagement" className="font-bold underline">
            Open Audience Engagement
          </Link>
        </p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
          PLANNING ONLY / NO BLENDER RENDER / NO PAID GPU / NO COMMERCIAL ASSETS PROCESSED
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Synthetic fixture EP012. Dialogue refs are references only. No voice was generated.
        </p>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Episode</p>
          <p className="mt-1 text-lg font-bold">
            {plan.episodeId} · {plan.title}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Shot count</p>
          <p className="mt-1 text-lg font-bold">{plan.shots.length}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Story beats</p>
          <p className="mt-1 text-lg font-bold">{plan.storyBeats.length}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Locations</p>
          <p className="mt-1 text-lg font-bold">{plan.receipt.uniqueLocationCount}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Estimated location loads saved
          </p>
          <p className="mt-1 text-lg font-bold">{batch.estimatedLoadsSaved}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Warm-cache opportunities
          </p>
          <p className="mt-1 text-lg font-bold">{plan.receipt.warmCacheOpportunityCount}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Blocked shots</p>
          <p className="mt-1 text-lg font-bold">{plan.receipt.blockedShotCount}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Planning status</p>
          <p className="mt-1 text-lg font-bold">{plan.planningStatus}</p>
        </div>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Story beats</h2>
        <ol className="space-y-2 text-sm">
          {plan.storyBeats.map((beat) => (
            <li key={beat.beatId}>
              <span className="font-bold">{beat.kind}</span>
              <span className="text-[var(--color-text-muted)]"> · {beat.storyPurpose}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Narrative order</h2>
        <p className="text-sm text-[var(--color-text-muted)]">{plan.storyOrder.join(' → ')}</p>
        <h3 className="font-bold">Production grouping</h3>
        <ul className="space-y-2 text-sm">
          {plan.locationBlocks.map((block) => (
            <li key={block.locationBlockId}>
              <span className="font-bold">{block.locationBlockId}</span>
              <span className="text-[var(--color-text-muted)]">
                {' '}
                · {block.locationPresetId} · {block.lightingPresetId} · {block.shotIds.join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Shots</h2>
        <ul className="space-y-3 text-sm">
          {plan.shots.map((shot) => (
            <li key={shot.shotId} className="rounded-2xl border border-[var(--color-border)] px-3 py-3">
              <p className="font-bold">
                {shot.shotId} · {shot.cameraTemplateId}
              </p>
              <p className="text-[var(--color-text-muted)]">
                {shot.locationPresetId} · {shot.lightingPresetId} · {shot.focalTarget}
              </p>
              <p>Dependency {shot.shotDependencySha256.slice(0, 16)}…</p>
              <p>Visual {shot.visualApprovalReceiptRef.result} · {shot.visualApprovalReceiptRef.score}/100</p>
              <p>Rerender {shot.rerenderStatus}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
