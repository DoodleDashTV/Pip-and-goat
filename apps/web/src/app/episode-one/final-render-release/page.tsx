import Link from 'next/link';
import { compileEp001FinalRenderReleaseGate } from '@/lib/tivvlejoy-ep001-final-render-release-gate';

export const metadata = {
  title: 'Episode 1 Final Render Release | TivvleJoy',
  description: 'Read-only final-render release gate for EP001.',
};

export default function EpisodeOneFinalRenderReleasePage() {
  const gate = compileEp001FinalRenderReleaseGate();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/animation-release" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Animation release gate</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 render handoff</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Final render release gate</h1></div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Final render blocked</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">The final paid render cannot launch until exact rigs, voices, scenery, animation/playblast review, worker image identity, cost cap, and explicit human authorization are all valid at the same time.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Release gates</p><p className="mt-1 font-display text-2xl font-bold">{gate.gates.length}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Evidence classes</p><p className="mt-1 font-display text-2xl font-bold">{gate.requiredEvidenceClasses.length}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Target</p><p className="mt-1 font-display text-lg font-bold">{gate.renderContract.targetResolution}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Format</p><p className="mt-1 font-display text-lg font-bold">{gate.renderContract.aspectRatio} · {gate.renderContract.fps} fps</p></div>
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Release requirements</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Nine gates before paid final render</h2>
        <ol className="mt-4 space-y-3">{gate.gates.map((item) => <li key={item.gateId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{item.gateId}</p><p className="mt-1 text-sm leading-6">{item.label}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold">{item.state}</span></div></li>)}</ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Evidence admission</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Seven real evidence classes remain manual</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{gate.requiredEvidenceClasses.map((row) => <article key={row.blockerCode} className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{row.blockerCode}</p><p className="mt-1 text-sm font-semibold">{row.label}</p><p className="mt-2 text-xs text-[var(--color-text-muted)]">{row.status} · manual gate {row.manualGateRequired ? 'required' : 'not required'}</p></article>)}</div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Immutable launch contract</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Paid execution must be exact and capped</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">{gate.releaseRules.map((rule) => <li key={rule} className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]">{rule}</li>)}</ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Release definition only</p><p className="mt-1">Render not launched · zero paid compute · zero network calls · zero storage or Production mutations · publishing remains blocked</p><p className="mt-3 break-all font-mono text-[11px]">Final render gate sha256:{gate.finalRenderGateSha256}</p>
      </section>
    </main>
  );
}
