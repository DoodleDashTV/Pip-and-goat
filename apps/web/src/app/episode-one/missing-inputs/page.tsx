import Link from 'next/link';
import { compileEp001MissingInputManifest } from '@/lib/tivvlejoy-ep001-missing-input-manifest';

export const metadata = {
  title: 'Episode 1 Missing Inputs | TivvleJoy',
  description: 'Machine-readable remaining external inputs for EP001.',
};

export default function Ep001MissingInputsPage() {
  const manifest = compileEp001MissingInputManifest();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/control-room" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Control room</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 external requirements</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Missing input manifest</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Every remaining external arrival is listed with required evidence, dependency phase, safe follow-up actions, and actions that remain human- or authorization-gated.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Missing', manifest.metrics.missingInputCount],
            ['Phase 0', manifest.metrics.phaseZeroMissingInputCount],
            ['Rigs', manifest.metrics.missingRigInputs],
            ['Paid auth', manifest.metrics.missingPaidAuthorizationInputs],
            ['Human', manifest.metrics.missingHumanDecisionInputs],
            ['License', manifest.metrics.missingLicenseInputs],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-[var(--color-surface)] p-4">
              <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        {manifest.missingInputs.map((input) => (
          <article key={input.triggerId} className="studio-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl font-bold">{input.triggerId}</p>
                <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">{input.arrivalClass} · {input.subject}</p>
              </div>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">PHASE {input.dependencyPhase ?? 'N/A'}</span>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Required evidence</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
                  {input.requiredArrivalEvidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Safe after arrival</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
                  {input.safeActionsAfterArrival.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Still gated</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
                  {input.stillRequiresHumanOrExplicitAuthority.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">{manifest.humanDecisionSummary.pendingRows} human decision rows remain pending.</p>
        <p className="mt-1">No external input is marked present. No authority is granted.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Missing input manifest sha256: {manifest.missingInputManifestSha256}</p>
      </section>
    </main>
  );
}
