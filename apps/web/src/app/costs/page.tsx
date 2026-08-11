import { prisma } from '@doodle-dash/database';
import { costAnalyticsService, costOptimizedWorkflowService } from '@doodle-dash/production';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await costOptimizedWorkflowService.bootstrap();
  const summary = await costAnalyticsService.summarize();
  const estimates = await prisma.renderCostEstimate.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const approvals = await prisma.paidGenerationApproval.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const byProvider: Record<string, number> = {};
  for (const entry of summary.entries) {
    const key = entry.category;
    byProvider[key] = (byProvider[key] ?? 0) + entry.amountUnits;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Budget</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Costs</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Distinguishes {summary.labels.paid} from {summary.labels.local}. Local Blender compute is not an
          API invoice — and is not treated as free electricity.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Paid external', value: summary.paidExternal.toFixed(2) },
          { label: 'Local / no API charge', value: summary.localNoApiCharge.toFixed(2) },
          {
            label: 'Voice (ledger)',
            value: (byProvider['VOICE'] ?? byProvider['TTS'] ?? 0).toFixed(2),
          },
          {
            label: 'AI video (ledger)',
            value: (byProvider['AI_VIDEO'] ?? 0).toFixed(2),
          },
        ].map((card) => (
          <article
            key={card.label}
            className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              {card.label}
            </p>
            <p className="mt-3 font-display text-2xl font-semibold">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-xl font-semibold">By category</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {Object.entries(summary.byCategory).map(([cat, amount]) => (
            <li key={cat} className="flex justify-between border-b border-[var(--line)] py-2">
              <span>{cat}</span>
              <span className="text-sun-300">{amount.toFixed(2)}</span>
            </li>
          ))}
          {Object.keys(summary.byCategory).length === 0 ? (
            <li className="text-[var(--muted)]">No ledger entries yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-xl font-semibold">Recent render estimates</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {estimates.map((e) => (
            <li key={e.id} className="border-b border-[var(--line)] py-2">
              Episode {e.episodeId.slice(0, 8)}… · {e.profileCode} · frames {e.frameCount} · ~
              {e.estimatedRenderMinutes} min · external ${e.estimatedExternalApiCost}
            </li>
          ))}
          {estimates.length === 0 ? (
            <li className="text-[var(--muted)]">No estimates yet — run estimator before render.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-xl font-semibold">Cost Guardian approvals</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {approvals.map((a) => (
            <li key={a.id} className="border-b border-[var(--line)] py-2">
              {a.provider} · {a.status} · est ${a.estimatedCost ?? 0} — {a.reason}
            </li>
          ))}
          {approvals.length === 0 ? (
            <li className="text-[var(--muted)]">No paid-generation requests (AI video remains OFF).</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
