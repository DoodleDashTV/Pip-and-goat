import Link from 'next/link';
import { compileEp001CriticalPathScheduler } from '@/lib/tivvlejoy-ep001-critical-path-scheduler';

export const metadata = {
  title: 'Episode 1 Critical Path | TivvleJoy',
  description: 'Fail-closed external-input critical path for EP001.',
};

export default function Ep001CriticalPathPage() {
  const scheduler = compileEp001CriticalPathScheduler();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/contract-watchdog" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Contract watchdog</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 dependency order</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Critical path scheduler</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Rigs, scenery proof, and voice authorization are parallel foundation inputs. Human decisions remain SHA-bound. Final render authorization remains last.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          {[
            ['Lanes', scheduler.metrics.totalLanes],
            ['Ready', scheduler.metrics.readyLanes],
            ['Waiting', scheduler.metrics.waitingLanes],
            ['Phase-0 waiting', scheduler.metrics.phaseZeroWaiting],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-[var(--color-surface)] p-4">
              <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        {scheduler.phases.map((phase) => (
          <article key={phase.phase} className="studio-card p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Phase {phase.phase}</p>
            <h2 className="mt-1 font-display text-xl font-bold">{phase.name}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
              {phase.triggers.map((triggerId) => <li key={triggerId}>{triggerId}</li>)}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">{scheduler.state}</p>
        <p className="mt-1">No phase bypass · no provider calls · no Blender launch · no paid requests · no Production writes.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Critical path scheduler sha256: {scheduler.criticalPathSchedulerSha256}</p>
      </section>
    </main>
  );
}
