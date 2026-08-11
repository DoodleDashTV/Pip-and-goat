import Link from 'next/link';
import { prisma } from '@doodle-dash/database';
import {
  blenderWorkerHealthService,
  costAnalyticsService,
  costOptimizedWorkflowService,
} from '@doodle-dash/production';
import { PRODUCT_DISPLAY_NAME } from '@doodle-dash/domain';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const universe = await prisma.universe.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (universe) {
    await costOptimizedWorkflowService.bootstrap(universe.id);
  }

  const [
    characters,
    episodes,
    pipelineRuns,
    draftReviews,
    missingAssets,
    blender,
    costs,
  ] = await Promise.all([
    prisma.character.findMany({
      where: { foundingCharacter: true },
      include: { models: true },
      orderBy: { internalCode: 'asc' },
    }),
    prisma.episode.findMany({ orderBy: { updatedAt: 'desc' }, take: 8 }),
    prisma.episodePipelineRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { stages: true },
    }),
    prisma.draftReview.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.asset.count({ where: { missing: true } }),
    blenderWorkerHealthService.status(),
    costAnalyticsService.summarize(),
  ]);

  const blockedRuns = pipelineRuns.filter((r) => r.status === 'BLOCKED').length;
  const draftsAwaiting = draftReviews.filter((d) => d.status === 'PENDING').length;
  const finalsReady = draftReviews.filter((d) => d.status === 'APPROVED').length;
  const continueEpisode =
    episodes.find((e) =>
      ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION'].includes(e.status),
    ) ??
    episodes[0] ??
    null;

  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8 shadow-studio backdrop-blur-md md:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">
          {PRODUCT_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-mist-100 md:text-5xl">
          {universe?.brandName ?? PRODUCT_DISPLAY_NAME}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--muted)] md:text-lg">
          Extremely high-quality children’s animation at the best quality per dollar. Blender-first.
          EEVEE-first. 1080×1920 finals. Reuse locked assets. Render only what changed.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/new-episode"
            className="rounded-2xl bg-leaf-500 px-5 py-3 text-sm font-extrabold text-ink-950 transition hover:bg-leaf-400"
          >
            NEW EPISODE
          </Link>
          <Link
            href={
              continueEpisode
                ? `/episodes/${continueEpisode.id}/readiness`
                : '/episodes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/readiness'
            }
            className="rounded-2xl border border-leaf-400/40 px-5 py-3 text-sm font-bold text-leaf-300 transition hover:bg-leaf-500/10"
          >
            CONTINUE EPISODE
          </Link>
          <Link
            href="/asset-intake"
            className="rounded-2xl border border-leaf-400/40 px-5 py-3 text-sm font-bold text-leaf-300"
          >
            ASSETS
          </Link>
          <Link
            href="/animations"
            className="rounded-2xl border border-leaf-400/40 px-5 py-3 text-sm font-bold text-leaf-300"
          >
            ANIMATIONS
          </Link>
          <Link
            href="/render-queue"
            className="rounded-2xl border border-leaf-400/40 px-5 py-3 text-sm font-bold text-leaf-300"
          >
            RENDER QUEUE
          </Link>
          <Link
            href="/readiness"
            className="rounded-2xl border border-leaf-400/40 px-5 py-3 text-sm font-bold text-leaf-300"
          >
            READINESS
          </Link>
          <Link
            href="/costs"
            className="rounded-2xl border border-leaf-400/40 px-5 py-3 text-sm font-bold text-leaf-300"
          >
            COSTS
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Episodes in progress', value: String(episodes.length) },
          { label: 'Episodes blocked', value: String(blockedRuns) },
          { label: 'Drafts awaiting approval', value: String(draftsAwaiting) },
          { label: 'Finals ready', value: String(finalsReady) },
          {
            label: 'Render worker',
            value: blender.blender.available
              ? blender.workerOnline
                ? 'Online'
                : 'Blender OK / worker offline'
              : 'BLENDER REQUIRED',
          },
          { label: 'Missing assets', value: String(missingAssets) },
          {
            label: 'Paid external (ledger)',
            value: String(costs.paidExternal.toFixed(2)),
          },
          {
            label: 'Local compute units',
            value: String(costs.localNoApiCharge.toFixed(2)),
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-[var(--line)] bg-ink-800/70 p-5 backdrop-blur"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              {card.label}
            </p>
            <p className="mt-3 font-display text-2xl font-semibold text-mist-100">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {characters.map((character) => {
          const model = character.models[0];
          return (
            <Link
              key={character.id}
              href={`/characters/${character.internalCode}`}
              className="group rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 transition hover:border-leaf-400/50"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sun-400">
                {character.internalCode}
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold">{character.name}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Model: {model?.status ?? 'MISSING'} · productionReady=
                {String(model?.productionReady ?? false)}
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
