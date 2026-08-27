import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Character Production Package | TivvleJoy', description: 'Fail-closed canonical package contract for approved Pip and Goat rigs.' };

const required = [
  'canonical Blender 4.2 .blend source hash and exact byte size',
  'immutable rig upload receipt',
  'immutable canonical control-adapter receipt',
  'validation job and validation-result hashes',
  'inspection/deformation evidence bundle',
  'exact human approval receipt',
  'FBX export hash',
  'GLB export hash',
  'rig README hash',
];

export default function CharacterProductionPackagePage() {
  return <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
    <section className="studio-card p-4 sm:p-6">
      <Link href="/episode-one/rig-post-validation-review" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Rig human review</Link>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Post-approval packaging</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Approved rigs already have a production-package contract</h1>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Once a Pip or Goat rig is genuinely approved, the package compiler binds the exact source, adapter, technical results, evidence and human receipt into one immutable registry candidate. It still performs no registry write automatically.</p>
    </section>
    <section className="studio-card p-4 sm:p-6"><h2 className="font-display text-2xl font-bold">Required package evidence</h2><ul className="mt-4 grid gap-2 sm:grid-cols-2">{required.map((item) => <li key={item} className="rounded-xl border border-[var(--color-border)] p-3 text-sm">{item}</li>)}</ul></section>
    <section className="studio-card p-4 sm:p-6"><h2 className="font-display text-2xl font-bold">Locked runtime assumptions</h2><dl className="mt-4 grid gap-px overflow-hidden rounded-xl bg-[var(--color-border)] sm:grid-cols-4">{[['Blender','4.2'],['Animation','30 fps'],['Master','1080×1920'],['Registry writes','explicit only']].map(([k,v]) => <div key={k} className="bg-[var(--color-surface)] p-3"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{k}</dt><dd className="mt-1 font-bold">{v}</dd></div>)}</dl></section>
    <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]"><p className="font-bold">A complete package is still only a registry candidate.</p><p className="mt-1">Admission and Production enablement remain explicit downstream actions; this compiler cannot self-admit a character.</p></section>
  </main>;
}
