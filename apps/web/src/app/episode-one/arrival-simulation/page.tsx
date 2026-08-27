import Link from 'next/link';
import { compileEp001ExternalArrivalSimulationAudit } from '@/lib/tivvlejoy-ep001-external-arrival-simulation-audit';

export const metadata = {
  title: 'Episode 1 Arrival Simulation | TivvleJoy',
  description: 'Synthetic six-path audit of EP001 external-arrival handlers.',
};

export default function Ep001ArrivalSimulationPage() {
  const audit = compileEp001ExternalArrivalSimulationAudit();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/autonomous-readiness" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">
            ← Autonomous readiness
          </Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 synthetic QA</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">External arrival simulation audit</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">
            Six synthetic fixtures exercise every external-arrival handler. Fixtures cannot satisfy evidence, approval, or spending gates.
          </p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-3">
          {[
            ['Scenarios', audit.metrics.scenarioCount],
            ['Unique triggers', audit.metrics.uniqueTriggerCount],
            ['Authority leaks', audit.metrics.authorityLeakCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-[var(--color-surface)] p-4">
              <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        {audit.results.map((result) => (
          <article key={result.scenarioId} className="studio-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl font-bold">{result.scenarioId}</p>
                <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">{result.triggerId}</p>
              </div>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">SYNTHETIC ONLY</span>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Safe actions</dt><dd className="mt-1 font-bold">{result.safeActionCount}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Blocked actions</dt><dd className="mt-1 font-bold">{result.blockedActionCount}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Authority</dt><dd className="mt-1 font-bold">CLOSED</dd></div>
            </dl>
            <p className="mt-3 break-all font-mono text-[11px] text-[var(--color-text-muted)]">Intake plan sha256: {result.intakePlanSha256}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">Synthetic coverage only. No real evidence was admitted.</p>
        <p className="mt-1">No provider calls · no Blender launch · no paid requests · no Production writes · no auto-approval.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Simulation audit sha256: {audit.simulationAuditSha256}</p>
      </section>
    </main>
  );
}
