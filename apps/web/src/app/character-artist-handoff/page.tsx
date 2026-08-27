import Link from 'next/link';
import { compileCharacterArtistDeliveryCheckpoint } from '@/lib/tivvlejoy-character-artist-delivery-checkpoint';

export const metadata = {
  title: 'Character Artist Handoff | TivvleJoy',
  description: 'Read-only Goat-first, Bird-second outsourced character delivery checkpoint.',
};

export default function CharacterArtistHandoffPage() {
  const checkpoint = compileCharacterArtistDeliveryCheckpoint();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/production-gateway" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Episode 1 production gateway</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">External character production</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Character artist handoff</h1></div><span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Goat first · Bird second</span></div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">Tracks the outsourced handoff separately from TivvleJoy approval. Paying for or receiving a seller delivery never marks a rig production-ready by itself.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-3"><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Deliveries</p><p className="mt-1 font-display text-2xl font-bold">{checkpoint.deliveries.length}</p></div><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Received</p><p className="mt-1 font-display text-2xl font-bold">0</p></div><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Production-ready</p><p className="mt-1 font-display text-2xl font-bold">0</p></div></div>
      </section>

      {checkpoint.deliveries.map((delivery) => (
        <section key={delivery.characterId} className="studio-card p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">STEP {delivery.sequence} · {delivery.characterId}</p><h2 className="mt-1 font-display text-2xl font-bold">{delivery.displayName}</h2></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">{delivery.workOrderState}</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="text-xs font-bold text-[var(--color-text-muted)]">Quoted price</p><p className="mt-1 text-lg font-bold">{delivery.commercialTerms.quotedUsd === null ? 'Not locked' : `$${delivery.commercialTerms.quotedUsd}`}</p></div><div className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="text-xs font-bold text-[var(--color-text-muted)]">Source SHA</p><p className="mt-1 text-sm font-bold">Not received</p></div><div className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="text-xs font-bold text-[var(--color-text-muted)]">Inspection</p><p className="mt-1 text-sm font-bold">{delivery.inspectionState}</p></div></div>
          <h3 className="mt-5 font-display text-lg font-bold">Required seller scope</h3><ul className="mt-3 grid gap-2 sm:grid-cols-2">{delivery.expectedScope.map((item) => <li key={item} className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm leading-5">{item}</li>)}</ul>
        </section>
      ))}

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Handoff sequence</p><ol className="mt-4 space-y-2">{checkpoint.handoffSequence.map((item, index) => <li key={item} className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm leading-6"><span className="mr-2 font-bold text-[var(--color-primary)]">{index + 1}.</span>{item}</li>)}</ol></section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]"><p className="font-bold">Checkpoint only</p><p className="mt-1">No seller messages · no order placement · no payment · no source bytes · no storage/Production mutation · no automatic approval</p><p className="mt-3 break-all font-mono text-[11px]">Checkpoint sha256:{checkpoint.checkpointSha256}</p></section>
    </main>
  );
}
