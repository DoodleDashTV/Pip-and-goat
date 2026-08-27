import Link from 'next/link';
import { compileRigAnimationCompatibilitySuite } from '@/lib/tivvlejoy-rig-animation-compatibility-suite';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Episode 1 Rig Animation Compatibility | TivvleJoy',
  description: 'Prebuilt animation compatibility and deformation test matrix for incoming Pip and Goat rigs.',
};

export default function Ep001RigAnimationCompatibilityPage() {
  const suite = compileRigAnimationCompatibilitySuite();
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card p-4 sm:p-6">
        <Link href="/episode-one/rig-control-adapter" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Rig control adapter</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 compatibility suite</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Animation tests are already defined before the rigs arrive</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">The final files will not determine our quality bar. They will be tested against this locked matrix in Blender 4.2 at 30 fps, with evidence and human approval still required.</p>
        <dl className="mt-5 grid gap-px overflow-hidden rounded-2xl bg-[var(--color-border)] sm:grid-cols-5">
          {[['Pip tests', suite.pip.length], ['Goat tests', suite.goat.length], ['Total tests', suite.totalTests], ['Executed now', 0], ['Auto approvals', 0]].map(([label, value]) => <div key={String(label)} className="bg-[var(--color-surface)] p-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>)}
        </dl>
        <p className="mt-4 break-all font-mono text-[11px] text-[var(--color-text-muted)]">Compatibility suite SHA-256: {suite.suiteSha256}</p>
      </section>

      {([['Pip', suite.pip], ['Goat', suite.goat]] as const).map(([label, tests]) => (
        <section key={label} className="studio-card p-4 sm:p-6">
          <h2 className="font-display text-2xl font-bold">{label} test matrix</h2>
          <div className="mt-4 space-y-3">
            {tests.map((test) => <article key={test.id} className="rounded-2xl border border-[var(--color-border)] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-display text-lg font-bold">{test.label}</p><p className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)]">{test.id} · {test.durationFrames} frames</p></div><span className="status-warning rounded-full px-3 py-1 text-xs font-bold">waiting for real rig</span></div><div className="mt-3 grid gap-4 lg:grid-cols-3"><div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Required controls</p><p className="mt-1 font-mono text-xs leading-5">{test.requiredControls.join(', ')}</p></div><div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Acceptance</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">{test.acceptance.map((item) => <li key={item}>{item}</li>)}</ul></div><div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Evidence required</p><p className="mt-1 font-mono text-xs leading-5">{test.evidenceKinds.join(', ')}</p></div></div></article>)}
          </div>
        </section>
      ))}

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">No compatibility test has been executed yet.</p>
        <p className="mt-1">A synthetic or structurally complete adapter cannot pass the rig. Real Blender execution on the exact delivered source plus human visual review is still required.</p>
      </section>
    </main>
  );
}
