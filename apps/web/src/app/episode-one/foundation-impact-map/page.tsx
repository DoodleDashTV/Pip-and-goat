import Link from 'next/link';
import { compileEp001FoundationImpactMap } from '@/lib/tivvlejoy-ep001-foundation-impact-map';

export const metadata = {
  title: 'Episode 1 Foundation Impact Map | TivvleJoy',
  description: 'Read-only map from external foundation arrivals to affected EP001 decision gates.',
};

export default function Ep001FoundationImpactMapPage() {
  const map = compileEp001FoundationImpactMap();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/external-handoff-package" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← External handoff package</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 external-input impact</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Foundation impact map</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Shows exactly which human-review rows each external foundation input affects. Arrival only creates evidence work; it never grants approval.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          {[
            ['Foundation inputs', map.metrics.foundationInputCount],
            ['Decision relationships', map.metrics.totalDecisionRelationships],
            ['Unique decisions impacted', map.metrics.uniqueImpactedDecisionCount],
            ['Integrity failures', map.metrics.impactIntegrityFailureCount],
          ].map(([label, value]) => <div key={String(label)} className="bg-[var(--color-surface)] p-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>)}
        </dl>
      </section>

      <section className="space-y-3">
        {map.inputs.map((input) => (
          <article key={input.triggerId} className="studio-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{input.triggerId}</p><p className="mt-1 font-display text-xl font-bold">{input.subject}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">{input.impactedDecisionCount} decision rows</span></div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">{input.relatedDecisionIds.map((id) => <li key={id} className="font-mono text-xs">{id}</li>)}</ul>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">Impact does not equal approval.</p>
        <p className="mt-1">No admission · no human approval · no paid execution · no Production writes.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Foundation impact map sha256: {map.foundationImpactMapSha256}</p>
      </section>
    </main>
  );
}
