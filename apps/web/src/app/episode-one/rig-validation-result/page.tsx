import Link from 'next/link';
import { compileRigAnimationCompatibilitySuite } from '@/lib/tivvlejoy-rig-animation-compatibility-suite';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Episode 1 Rig Validation Result | TivvleJoy',
  description: 'Fail-closed contract for future Blender rig validation results.',
};

export default function Ep001RigValidationResultPage() {
  const suite = compileRigAnimationCompatibilitySuite();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card p-4 sm:p-6">
        <Link href="/episode-one/rig-validation-job" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Validation job contract</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 rig validation result</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Worker output cannot self-approve a rig</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Future Blender results are accepted only when the rig version, source receipt, adapter, compatibility suite, job, Blender version, frame rate, test IDs, frame counts, evidence hashes, and technical metrics all agree. Even a completely clean technical suite still waits for human approval.</p>
        <dl className="mt-5 grid gap-px overflow-hidden rounded-2xl bg-[var(--color-border)] sm:grid-cols-4">
          {[['Expected Pip tests', suite.pip.length], ['Expected Goat tests', suite.goat.length], ['Results received', 0], ['Human approvals', 0]].map(([label, value]) => <div key={String(label)} className="bg-[var(--color-surface)] p-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>)}
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Result acceptance chain</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            'Exact rig version ID and source SHA match',
            'Rig receipt SHA and adapter SHA match',
            'Compatibility-suite SHA and job SHA match',
            'Blender 4.2 and 30 fps match the locked contract',
            'Every expected test ID is present exactly once',
            'Every test rendered the exact planned frame count',
            'Manifest, playblast, metrics, and stills hashes are valid',
            'No missing controls or technical error counts are reported',
            'Human visual approval is still performed separately',
          ].map((item, index) => <li key={item} className="rounded-xl border border-[var(--color-border)] p-3 text-sm"><span className="mr-2 font-bold">{index + 1}.</span>{item}</li>)}
        </ol>
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">No real validation result exists yet.</p>
        <p className="mt-1">This contract is ready now so the future worker cannot define its own acceptance rules after seeing the rig.</p>
      </section>
    </main>
  );
}
