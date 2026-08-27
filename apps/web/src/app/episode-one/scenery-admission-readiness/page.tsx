import Link from 'next/link';
import { compileEp001SceneryAdmissionReadiness } from '@/lib/tivvlejoy-ep001-scenery-admission-readiness';

export const metadata = {
  title: 'Episode 1 Scenery Admission Readiness | TivvleJoy',
  description: 'Read-only source-hash, license, inspection, and approval packet for EP001 scenery.',
};

export default function Ep001SceneryAdmissionReadinessPage() {
  const packet = compileEp001SceneryAdmissionReadiness();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/scenery" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Episode 1 scenery plan</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 world production</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Scenery admission readiness</h1></div><span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Packet ready · bindings unresolved</span></div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">Every required environment role now has an exact future identity slot for source version, byte size, SHA-256, license/provenance, inspection, and human approval.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Locations</p><p className="mt-1 font-display text-2xl font-bold">{packet.metrics.locationCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Shots</p><p className="mt-1 font-display text-2xl font-bold">{packet.metrics.shotCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Semantic slots</p><p className="mt-1 font-display text-2xl font-bold">{packet.metrics.semanticSlotCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Approved slots</p><p className="mt-1 font-display text-2xl font-bold">0</p></div>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{packet.slots.map((slot) => <article key={slot.slotId} className="studio-card p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{slot.slotId}</p><p className="mt-1 font-display text-lg font-bold">{slot.semanticRole}</p><p className="mt-2 text-sm text-[var(--color-text-muted)]">{slot.locationId} · {slot.qualityTier}</p><p className="mt-3 text-xs font-bold">{slot.state}</p></article>)}</section>
      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Admission sequence</p><ol className="mt-4 space-y-2">{packet.admissionOrder.map((step, index) => <li key={step} className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm"><span className="mr-2 font-mono font-bold text-[var(--color-primary)]">{String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol></section>
      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Fail-closed rules</p><ul className="mt-4 grid gap-2 sm:grid-cols-2">{packet.failureRules.map((rule) => <li key={rule} className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]">{rule}</li>)}</ul></section>
      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]"><p className="font-bold">Admission packet only</p><p className="mt-1">No commercial source bytes read · Blender not launched · zero paid requests · zero storage/Production mutations</p><p className="mt-3 break-all font-mono text-[11px]">Scenery readiness sha256:{packet.sceneryAdmissionReadinessSha256}</p></section>
    </main>
  );
}
