import Link from 'next/link';
import { compileEp001ProductionHandoff } from '@/lib/tivvlejoy-ep001-production-handoff';

export const metadata = {
  title: 'Episode 1 Production Handoff | TivvleJoy',
  description: 'Read-only dependency graph and controlled execution order for Meadow Map Mystery.',
};

const formatToken = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--color-surface)] p-4">
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-display text-xl font-bold text-[var(--color-text)]">{value}</dd>
    </div>
  );
}

export default function EpisodeOneHandoffPage() {
  const handoff = compileEp001ProductionHandoff();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link
            href="/episode-one"
            className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]"
          >
            ← Episode 1 review
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Episode 1 control packet
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
                Production handoff
              </h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
              Planning complete. Execution still blocked.
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            One immutable dependency graph and one ordered route from the approved planning package
            to a future controlled preflight. No step can auto-advance or turn planning evidence
            into launch authority.
          </p>
          <Link
            href="/episode-one/evidence"
            className="mt-4 inline-flex min-h-touch items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold"
          >
            Open evidence admission
          </Link>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <MetricCard label="Planning inputs" value={handoff.metrics.immutablePlanningInputCount} />
          <MetricCard label="Execution steps" value={handoff.metrics.executionStepCount} />
          <MetricCard label="Open blockers" value={handoff.metrics.blockerCount} />
          <MetricCard label="Animatic frames" value={handoff.metrics.structuralAnimaticFrames} />
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Immutable dependency graph
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Six planning packages bound by exact SHA-256
        </h2>
        <ol className="mt-5 space-y-3">
          {handoff.dependencyGraph.map((node, index) => (
            <li
              key={node.nodeId}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-bold text-[var(--color-primary)]">
                    Input {index + 1} · {node.nodeId}
                  </p>
                  <p className="mt-2 break-all font-mono text-xs leading-5 text-[var(--color-text-muted)]">
                    sha256:{node.sha256}
                  </p>
                </div>
                <span className="status-success rounded-full px-3 py-1 text-xs font-bold">
                  Planning verified
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                Depends on:{' '}
                <span className="font-bold text-[var(--color-text)]">
                  {node.dependsOn.length ? node.dependsOn.join(' · ') : 'root input'}
                </span>
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Controlled execution order
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Advance only when exact evidence exists
        </h2>
        <ol className="mt-5 space-y-3">
          {handoff.executionPlan.map((step) => (
            <li
              key={step.stepId}
              className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs font-bold text-[var(--color-warning-foreground)]">
                  {step.ordinal}. {step.stepId} · {formatToken(step.department)}
                </p>
                <span className="text-xs font-bold text-[var(--color-warning-foreground)]">
                  Blocked
                </span>
              </div>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--color-text)]">
                {step.label}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--color-warning-foreground)]">
                Requires: {step.requires.join(' · ')}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Current blockers
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Seven approvals or bindings remain external
            </h2>
          </div>
          <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
            Launch forbidden
          </span>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {handoff.remainingBlockers.map((blocker) => (
            <li
              key={blocker.code}
              className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-6 text-[var(--color-warning-foreground)]"
            >
              <span className="font-mono text-xs font-bold">{blocker.code}</span>
              <span className="mt-1 block">{blocker.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Safe planning handoff only</p>
        <p className="mt-1">
          Exact dependency hashes · no real asset bytes · zero network calls · zero paid requests ·
          zero remote storage or Production mutations
        </p>
      </section>
    </main>
  );
}
