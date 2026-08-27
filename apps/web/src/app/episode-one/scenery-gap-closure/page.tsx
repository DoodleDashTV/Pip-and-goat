import Link from 'next/link';
import { compileEp001SceneryGapClosure } from '@/lib/tivvlejoy-ep001-scenery-gap-closure';

export const metadata = {
  title: 'Episode 1 Scenery Gap Closure | TivvleJoy',
  description: 'Read-only source and native-recipe capability closure for EP001 scenery.',
};

export default function Ep001SceneryGapClosurePage() {
  const packet = compileEp001SceneryGapClosure();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/scenery-source-inspection" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Real scenery source inspection</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 environment capability</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Scenery gap closure</h1></div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Capability complete · admission closed</span>
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">Every EP001 scenery semantic role now has either an observed real source candidate or a deterministic native Blender recipe. This does not grant license, visual, or production approval.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <Metric label="Total slots" value={packet.metrics.totalSlots} />
          <Metric label="Real-source slots" value={packet.metrics.realSourceCandidateSlots} />
          <Metric label="Native-recipe slots" value={packet.metrics.nativeRecipeSlots} />
          <Metric label="Unresolved capability" value={packet.metrics.unresolvedCapabilitySlots} />
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">New real source evidence</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {packet.additionalObservedSources.map((source) => <article key={source.sourceId} className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{source.sourceId}</p><p className="mt-2 text-sm">{source.libraryPath}</p><p className="mt-2 text-sm"><b>Bytes:</b> {source.exactByteSize.toLocaleString()}</p><p className="mt-2 break-all font-mono text-[11px]">SHA-256: {source.sha256}</p><p className="mt-2 text-xs">CRC clean · not executed · not admitted</p></article>)}
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Native construction recipes</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{packet.nativeRecipes.map((recipe) => <article key={recipe.recipeId} className="rounded-2xl border border-[var(--color-border)] p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{recipe.recipeId} · {recipe.semanticRole}</p><p className="mt-2 text-sm leading-6">{recipe.method}</p><p className="mt-3 text-xs text-[var(--color-text-muted)]">No additional purchase required · execution and human approval still required</p></article>)}</div>
      </section>

      <section className="space-y-3">
        {packet.slots.map((slot) => <article key={slot.slotId} className="studio-card p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{slot.slotId}</p><p className="mt-1 font-bold">{slot.semanticRole}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">{slot.capabilityState}</span></div><p className="mt-3 text-sm">Closure: {slot.closureRef.join(', ') || 'none'}</p></article>)}
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">No scenery capability gap remains</p>
        <p className="mt-1">0 unresolved capability slots · 0 admitted slots · no automatic approvals · no Blender execution</p>
        <p className="mt-3 break-all font-mono text-[11px]">Scenery gap closure sha256: {packet.sceneryGapClosureSha256}</p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p></div>;
}
