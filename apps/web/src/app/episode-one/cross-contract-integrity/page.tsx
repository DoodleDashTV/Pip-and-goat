import Link from 'next/link';
import { compileEp001CrossContractIntegrityAudit } from '@/lib/tivvlejoy-ep001-cross-contract-integrity';

export const metadata = {
  title: 'Episode 1 Contract Integrity | TivvleJoy',
  description: 'Read-only EP001 cross-contract decision, trigger, scheduler, and simulation integrity audit.',
};

export default function Ep001CrossContractIntegrityPage() {
  const audit = compileEp001CrossContractIntegrityAudit();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/control-room" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Control room</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 contract safety</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Cross-contract integrity</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Decision IDs, external triggers, scheduler lanes, and synthetic simulations must all agree. Drift is reported and never auto-repaired.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Decision IDs', audit.metrics.decisionIdCount],
            ['Unique decisions', audit.metrics.uniqueDecisionIdCount],
            ['Triggers', audit.metrics.triggerIdCount],
            ['Unique triggers', audit.metrics.uniqueTriggerIdCount],
            ['Sim covered', audit.metrics.simulationCoveredTriggerCount],
            ['Issues', audit.metrics.issueCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-[var(--color-surface)] p-4">
              <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Integrity result</p>
        <h2 className="mt-1 font-display text-2xl font-bold">{audit.integrityPass ? 'PASS' : 'FAIL'}</h2>
        {audit.issues.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No orphan IDs, duplicate IDs, scheduler drift, or missing simulation coverage detected.</p>
        ) : (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">{audit.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        )}
      </section>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Bound contracts</h2>
        <dl className="mt-4 space-y-3">{Object.entries(audit.bindings).map(([key, hash]) => <div key={key}><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{key}</dt><dd className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-muted)]">{hash}</dd></div>)}</dl>
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">Integrity audit may report drift but never repairs or approves it.</p>
        <p className="mt-1">No provider calls · no Blender launch · no paid requests · no Production writes.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Cross-contract integrity sha256: {audit.crossContractIntegritySha256}</p>
      </section>
    </main>
  );
}
