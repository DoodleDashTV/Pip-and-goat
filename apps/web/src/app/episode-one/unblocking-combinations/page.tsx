import Link from 'next/link';
import { compileEp001UnblockingCombinationAudit } from '@/lib/tivvlejoy-ep001-unblocking-combination-audit';

export const metadata = {
  title: 'Episode 1 Unblocking Combinations | TivvleJoy',
  description: 'Exhaustive fail-closed audit of all EP001 external-arrival trigger combinations.',
};

export default function Ep001UnblockingCombinationsPage() {
  const audit = compileEp001UnblockingCombinationAudit();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/control-room" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Control room</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 combination QA</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">External-arrival combination audit</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Every subset of the six known external arrivals is simulated exactly once to catch combination-only queue, dependency, or authority defects.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Triggers', audit.metrics.triggerCount],
            ['Combinations', audit.metrics.combinationCount],
            ['Authority leaks', audit.metrics.authorityLeakCount],
            ['Accounting errors', audit.metrics.invalidFoundationAccounting],
            ['Foundation complete', audit.metrics.combinationsWithFoundationComplete],
            ['Max safe actions', audit.metrics.maxQueuedSafeActions],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-[var(--color-surface)] p-4">
              <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Coverage result</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">64/64 combinations evaluated. {audit.metrics.combinationsWithFoundationComplete} combinations contain all four foundation inputs. No combination may execute its compiled safe actions or inherit approval authority.</p>
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">Synthetic combination coverage only.</p>
        <p className="mt-1">No real arrival claimed · no provider calls · no Blender launch · no paid requests · no Production writes.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Combination audit sha256: {audit.unblockingCombinationAuditSha256}</p>
      </section>
    </main>
  );
}
