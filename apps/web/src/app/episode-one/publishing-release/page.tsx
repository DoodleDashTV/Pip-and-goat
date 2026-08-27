import Link from 'next/link';
import { compileEp001PublishingReleaseGate } from '@/lib/tivvlejoy-ep001-publishing-release-gate';

export const metadata = {
  title: 'Episode 1 Publishing Release | TivvleJoy',
  description: 'Read-only final-media and publishing release gate for EP001.',
};

export default function EpisodeOnePublishingReleasePage() {
  const gate = compileEp001PublishingReleaseGate();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/final-render-release" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Final render release gate</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 delivery</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Publishing release gate</h1></div><span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Publishing blocked</span></div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">A successful render is not a publishable delivery by itself. The exact encoded media must pass final technical and human review before any platform upload can be authorized.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4"><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Media checks</p><p className="mt-1 font-display text-2xl font-bold">{gate.mediaChecks.length}</p></div><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Destinations</p><p className="mt-1 font-display text-2xl font-bold">{gate.destinations.length}</p></div><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Target</p><p className="mt-1 font-display text-lg font-bold">{gate.deliverySpec.width}x{gate.deliverySpec.height}</p></div><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Duration</p><p className="mt-1 font-display text-lg font-bold">{gate.deliverySpec.durationSeconds}.000s</p></div></div>
      </section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Final media QA</p><h2 className="mt-2 font-display text-2xl font-bold">Nine checks before publishing approval</h2><ol className="mt-4 space-y-3">{gate.mediaChecks.map((item) => <li key={item.checkId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{item.checkId}</p><p className="mt-1 text-sm leading-6">{item.label}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold">{item.state}</span></div></li>)}</ol></section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Destinations</p><h2 className="mt-2 font-display text-2xl font-bold">No platform selected or authorized</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{gate.destinations.map((destination) => <article key={destination.destinationId} className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{destination.destinationId}</p><p className="mt-1 text-sm font-semibold">{destination.label}</p><p className="mt-2 text-xs text-[var(--color-text-muted)]">selected: no · upload authorized: no</p></article>)}</div></section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Fail-closed publishing rules</p><ul className="mt-4 grid gap-2 sm:grid-cols-2">{gate.releaseRules.map((rule) => <li key={rule} className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]">{rule}</li>)}</ul></section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]"><p className="font-bold">Publishing definition only</p><p className="mt-1">No media bytes · no upload attempt · zero external posts · zero network/storage/Production mutations · no scheduling</p><p className="mt-3 break-all font-mono text-[11px]">Publishing gate sha256:{gate.publishingGateSha256}</p></section>
    </main>
  );
}
