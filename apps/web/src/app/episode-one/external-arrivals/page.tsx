import Link from 'next/link';
import { compileEp001ExternalArrivalTriggerMatrix } from '@/lib/tivvlejoy-ep001-external-arrival-trigger-matrix';

export const metadata = {
  title: 'Episode 1 External Arrivals | TivvleJoy',
  description: 'Read-only next-action matrix for EP001 external evidence and authorization arrivals.',
};

export default function EpisodeOneExternalArrivalsPage() {
  const matrix = compileEp001ExternalArrivalTriggerMatrix();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/human-gates" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Human gates</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 external handoff</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">External arrival trigger matrix</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">When a rig, license receipt, human decision, or paid authorization arrives, this matrix defines the next zero-ambiguity action while keeping approval and spending gates closed.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-5">
          {[
            ['Triggers', matrix.metrics.triggerCount],
            ['Rig triggers', matrix.metrics.characterRigTriggers],
            ['Paid auth triggers', matrix.metrics.paidAuthorizationTriggers],
            ['Arrivals observed', matrix.metrics.externalArrivalsObserved],
            ['Actions executed', matrix.metrics.actionsExecuted],
          ].map(([label, value]) => <div key={String(label)} className="bg-[var(--color-surface)] p-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>)}
        </dl>
      </section>

      <section className="space-y-3">
        {matrix.triggers.map((trigger) => (
          <article key={trigger.triggerId} className="studio-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-display text-xl font-bold">{trigger.triggerId}</p><p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">{trigger.arrivalClass} · {trigger.subject}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">WAITING</span></div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Arrival evidence</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{trigger.requiredArrivalEvidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Safe next actions</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{trigger.automaticSafeNextActions.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Still blocked</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{trigger.blockedUntilHumanOrExplicitAuthority.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">Arrival handlers are prepared. No external arrival is claimed.</p>
        <p className="mt-1">No provider calls · no Blender launch · no paid requests · no Production writes · no auto-approval.</p>
        <p className="mt-3 break-all font-mono text-[11px]">External arrival matrix sha256: {matrix.externalArrivalTriggerMatrixSha256}</p>
      </section>
    </main>
  );
}
