import Link from 'next/link';
import { Ep001RigControlAdapterEditor } from '@/components/preview/Ep001RigControlAdapterEditor';
import { canonicalControlsFor } from '@/lib/tivvlejoy-rig-control-adapter';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Episode 1 Rig Control Adapter | TivvleJoy',
  description: 'Canonical control mapping layer between artist rigs and TivvleJoy animation tooling.',
};

export default function Ep001RigControlAdapterPage() {
  const pipCount = canonicalControlsFor('CHAR_PIP_001').length;
  const goatCount = canonicalControlsFor('CHAR_GOAT_001').length;
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card p-4 sm:p-6">
        <Link href="/episode-one/rig-inspection-evidence-inbox" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Rig inspection evidence</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 rig adapter</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Stable controls even if the artist names them differently</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Once a rig arrives, map each artist control name to TivvleJoy's canonical role. Animation plans can then target ROOT, HEAD, WING_L, JAW, PROP_ATTACH and other stable roles without depending on an individual artist's naming convention.</p>
        <dl className="mt-5 grid gap-px overflow-hidden rounded-2xl bg-[var(--color-border)] sm:grid-cols-4">
          {[['Pip required controls', pipCount], ['Goat required controls', goatCount], ['Mappings currently approved', 0], ['Production authority', 'none']].map(([label, value]) => <div key={String(label)} className="bg-[var(--color-surface)] p-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>)}
        </dl>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Ep001RigControlAdapterEditor characterId="CHAR_PIP_001" />
        <Ep001RigControlAdapterEditor characterId="CHAR_GOAT_001" />
      </div>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">A valid mapping is not a valid rig.</p>
        <p className="mt-1">The adapter only proves that all required canonical roles have unique artist-control bindings. Technical deformation tests and human approval remain mandatory.</p>
      </section>
    </main>
  );
}
