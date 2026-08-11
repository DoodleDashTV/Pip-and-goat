import Link from 'next/link';
import { prisma } from '@doodle-dash/database';
import {
  costAnalyticsService,
  costOptimizedWorkflowService,
  productionSetupService,
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

  const [setup, costs, draftReviews] = await Promise.all([
    productionSetupService.buildChecklist(),
    costAnalyticsService.summarize(),
    prisma.draftReview.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  const draftsAwaiting = draftReviews.filter((d) => d.status === 'PENDING').length;
  const readyCount = setup.steps.filter((s) => s.state === 'READY').length;

  return (
    <div className="space-y-8 overflow-x-hidden">
      <header className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-studio backdrop-blur-md sm:p-8 md:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">
          {PRODUCT_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-mist-100 md:text-5xl">
          {universe?.brandName ?? PRODUCT_DISPLAY_NAME}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--muted)]">
          Extremely high-quality children’s animation. Blender-first. EEVEE-first. 1080×1920 @ 30
          FPS. Reuse locked assets. Paid AI video off.
        </p>
      </header>

      <section className="rounded-[1.75rem] border border-leaf-400/40 bg-leaf-500/10 p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-leaf-300">
          What do I need to do next?
        </p>
        <p className="mt-3 text-sm text-mist-100">{setup.primaryAction.reason}</p>
        <Link
          href={setup.primaryAction.href}
          className="mt-5 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-leaf-500 px-5 py-4 text-center text-base font-extrabold text-ink-950"
        >
          {setup.primaryAction.label}
        </Link>
        <Link
          href="/production-setup"
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-leaf-400/40 px-4 py-3 text-center text-sm font-bold text-leaf-300"
        >
          Open full Production Setup checklist
        </Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Setup steps ready', value: `${readyCount}/${setup.steps.length}` },
          { label: 'Drafts awaiting approval', value: String(draftsAwaiting) },
          { label: 'Paid external (ledger)', value: costs.paidExternal.toFixed(2) },
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

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/asset-intake"
          className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 font-semibold text-leaf-300"
        >
          Assets / Pip & Goat uploads
        </Link>
        <Link
          href={`/episodes/${setup.episodeId}/readiness`}
          className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 font-semibold text-leaf-300"
        >
          Meadow Map Mystery readiness
        </Link>
        <Link
          href="/voices"
          className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 font-semibold text-leaf-300"
        >
          Voices
        </Link>
        <Link
          href="/costs"
          className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 font-semibold text-leaf-300"
        >
          Costs / approvals
        </Link>
      </section>
    </div>
  );
}
