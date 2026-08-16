import Link from 'next/link';
import { prisma } from '@doodle-dash/database';
import {
  costAnalyticsService,
  costOptimizedWorkflowService,
  productionSetupService,
} from '@doodle-dash/production';
import { STUDIO_DISPLAY_NAME, resolveStudioDisplayName } from '@doodle-dash/domain';
import { StudioStatusPanel } from '@/components/StudioStatusPanel';
import { isPublicWebsitePreview } from '@/lib/public-preview';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const publicPreview = isPublicWebsitePreview();
  const universe = publicPreview
    ? null
    : await prisma.universe.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      });
  if (universe) {
    await costOptimizedWorkflowService.bootstrap(universe.id);
  }

  const [setup, costs, draftReviews] = publicPreview
    ? [null, null, []]
    : await Promise.all([
        productionSetupService.buildChecklist(),
        costAnalyticsService.summarize(),
        prisma.draftReview.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      ]);

  const draftsAwaiting = draftReviews.filter((d) => d.status === 'PENDING').length;
  const readyCount = setup ? setup.steps.filter((s) => s.state === 'READY').length : 0;

  return (
    <div className="space-y-8 overflow-x-hidden">
      <header className="studio-card overflow-hidden p-6 sm:p-8 md:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">
          {STUDIO_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[var(--color-text)] md:text-5xl">
          {resolveStudioDisplayName(universe?.brandName)}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-text-muted)]">
          Extremely high-quality children’s animation. Blender-first. EEVEE-first. 1080×1920 @ 30
          FPS. Reuse locked assets. Paid AI video off.
        </p>
      </header>

      <StudioStatusPanel />

      <section className="studio-card border-[var(--color-primary)]/30 p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
          What do I need to do next?
        </p>
        {publicPreview || !setup ? (
          <>
            <p className="mt-3 text-sm text-[var(--color-text)]">
              Public preview only. Database-backed studio actions are not available yet. Closed
              gates stay closed. Paid resources stay unauthorized.
            </p>
            <p className="status-warning mt-5 inline-flex min-h-touch items-center gap-2 rounded-full px-3 py-2 text-sm font-bold">
              <span aria-hidden="true">!</span>
              <span>Not available yet</span>
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-[var(--color-text)]">{setup.primaryAction.reason}</p>
            <Link
              href={setup.primaryAction.href}
              className="btn-primary mt-5 w-full px-5 py-4 text-center text-base"
            >
              {setup.primaryAction.label}
            </Link>
            <Link
              href="/production-setup"
              className="mt-3 flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 py-3 text-center text-sm font-bold text-[var(--color-primary)]"
            >
              Open full Production Setup checklist
            </Link>
          </>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Setup steps ready',
            value: setup ? `${readyCount}/${setup.steps.length}` : 'Not available yet',
          },
          { label: 'Drafts awaiting approval', value: publicPreview ? 'Not available yet' : String(draftsAwaiting) },
          { label: 'Paid external (ledger)', value: costs ? costs.paidExternal.toFixed(2) : '0.00' },
        ].map((card) => (
          <div
            key={card.label}
            className="studio-card p-5"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              {card.label}
            </p>
            <p className="mt-3 font-display text-2xl font-semibold text-[var(--color-text)]">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/asset-intake"
          className="studio-card p-5 font-semibold text-[var(--color-primary)]"
        >
          Assets / Pip & Goat uploads
        </Link>
        <Link
          href={setup ? `/episodes/${setup.episodeId}/readiness` : '/workflow'}
          className="studio-card p-5 font-semibold text-[var(--color-primary)]"
        >
          {setup ? 'Meadow Map Mystery readiness' : 'Episode workflow (preview)'}
        </Link>
        <Link
          href="/voices"
          className="studio-card p-5 font-semibold text-[var(--color-primary)]"
        >
          Voices
        </Link>
        <Link
          href="/costs"
          className="studio-card p-5 font-semibold text-[var(--color-primary)]"
        >
          Costs / approvals
        </Link>
      </section>
    </div>
  );
}
