import Link from 'next/link';
import { prisma } from '@doodle-dash/database';
import {
  DEFAULT_PRODUCTION_SETTINGS,
  productionDirectorService,
  productionProfileService,
  costOptimizedWorkflowService,
} from '@doodle-dash/production';
import { DEFAULT_PRODUCTION_MODE, STUDIO_DISPLAY_NAME } from '@doodle-dash/domain';

export const dynamic = 'force-dynamic';

export default async function ProductionPage() {
  const universe = await prisma.universe.findFirst({ where: { status: 'ACTIVE' } });
  if (universe) await costOptimizedWorkflowService.bootstrap(universe.id);
  const profiles = await productionProfileService.seedProfiles();
  const episodes = await prisma.episode.findMany({ orderBy: { updatedAt: 'desc' }, take: 8 });

  const plan = productionDirectorService.planEpisode(
    [
      {
        shotId: 'demo-1',
        description: 'Pip and Goat meet in the meadow establishing shot',
        durationSeconds: 5,
        characterIds: ['pip', 'goat'],
        isHeroMoment: false,
        isDialogueHeavy: true,
        storyImportance: 55,
        reusableAnimationId: 'WALK',
      },
      {
        shotId: 'demo-2',
        description: 'Close-up reaction when they find the map',
        durationSeconds: 3,
        characterIds: ['pip'],
        isHeroMoment: true,
        isDialogueHeavy: false,
        storyImportance: 85,
      },
    ],
    DEFAULT_PRODUCTION_MODE,
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">{STUDIO_DISPLAY_NAME}</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Continue Episode</h1>
        <p className="mt-3 text-[var(--muted)]">
          Default final {DEFAULT_PRODUCTION_SETTINGS.defaultFinalResolution} @{' '}
          {DEFAULT_PRODUCTION_SETTINGS.defaultFps} FPS · {DEFAULT_PRODUCTION_SETTINGS.defaultFinalEngine} ·
          Blender-first
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {profiles.map((p) => (
          <article key={p.code} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-xs font-bold uppercase text-sun-400">{p.code}</p>
            <p className="mt-2 font-display text-xl">
              {p.width}×{p.height}
            </p>
            <p className="text-sm text-[var(--muted)]">
              {p.engine} · {p.fps} FPS
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-semibold">Episodes</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {episodes.map((ep) => (
            <li key={ep.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)] py-2">
              <span>
                {ep.title} <span className="text-[var(--muted)]">({ep.status})</span>
              </span>
              <span className="flex gap-3 text-xs">
                <Link className="text-leaf-300 underline" href={`/episodes/${ep.id}/readiness`}>
                  Readiness
                </Link>
                <Link className="text-leaf-300 underline" href={`/episodes/${ep.id}/draft-review`}>
                  Draft
                </Link>
                <Link className="text-leaf-300 underline" href={`/episodes/${ep.id}/shots`}>
                  Shots
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="text-sm text-[var(--muted)]">
          Planning sample (reuse-aware director) · mode {DEFAULT_PRODUCTION_MODE} · cost units{' '}
          {plan.totals.estimatedCostUnits}
        </p>
        <ul className="mt-4 space-y-3">
          {plan.shotPlans.map((shot) => (
            <li key={String(shot.shotId)} className="rounded-2xl bg-ink-950/40 px-4 py-3 text-sm">
              <span className="font-semibold text-leaf-300">{shot.renderMode}</span> · importance{' '}
              {shot.cinematicImportance}
              <p className="mt-1 text-[var(--muted)]">{shot.rationale.join(' ')}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
