import Link from 'next/link';
import { compileEp001AutonomousReadinessController } from '@/lib/tivvlejoy-ep001-autonomous-readiness-controller';

export const metadata = {
  title: 'Episode 1 Autonomous Readiness | TivvleJoy',
  description: 'Read-only fail-closed autonomous readiness controller for EP001.',
};

export default function Ep001AutonomousReadinessPage() {
  const controller = compileEp001AutonomousReadinessController();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link
            href="/episode-one/external-arrivals"
            className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]"
          >
            ← External arrivals
          </Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Episode 1 autonomous control
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Autonomous readiness controller
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">
            This controller computes what can safely advance without spending, approval transfer, or Production mutation. Unknown arrivals fail closed.
          </p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-5">
          {[
            ['Known triggers', controller.metrics.knownTriggers],
            ['Observed', controller.metrics.observedTriggers],
            ['Waiting', controller.metrics.waitingTriggers],
            ['Safe actions queued', controller.metrics.queuedSafeActions],
            ['Blocked actions', controller.metrics.blockedActionCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-[var(--color-surface)] p-4">
              <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Controller state</p>
            <p className="mt-1 font-display text-2xl font-bold">{controller.state}</p>
          </div>
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">
            FAIL-CLOSED
          </span>
        </div>
      </section>

      <section className="space-y-3">
        {controller.triggerStates.map((trigger) => (
          <article key={trigger.triggerId} className="studio-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl font-bold">{trigger.triggerId}</p>
                <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">
                  {trigger.arrivalClass} · {trigger.subject}
                </p>
              </div>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">
                {trigger.state}
              </span>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Safe queue now</p>
                {trigger.automaticSafeNextActions.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">None until this exact arrival is observed.</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
                    {trigger.automaticSafeNextActions.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Still blocked</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
                  {trigger.blockedActions.map((action) => <li key={action}>{action}</li>)}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">No external input has been observed. No safe action is queued.</p>
        <p className="mt-1">No provider calls · no Blender launch · no paid requests · no Production writes · no auto-approval.</p>
        <p className="mt-3 break-all font-mono text-[11px]">
          Autonomous readiness controller sha256: {controller.autonomousReadinessControllerSha256}
        </p>
      </section>
    </main>
  );
}
