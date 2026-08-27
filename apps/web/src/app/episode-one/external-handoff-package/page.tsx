import Link from 'next/link';
import { compileEp001ExternalHandoffPackage } from '@/lib/tivvlejoy-ep001-external-handoff-package';

export const metadata = {
  title: 'Episode 1 External Handoff | TivvleJoy',
  description: 'Immutable read-only EP001 external foundation-input handoff package.',
};

export default function Ep001ExternalHandoffPackagePage() {
  const packet = compileEp001ExternalHandoffPackage();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/control-room" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Control room</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 external handoff</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Foundation-input handoff package</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">One immutable package for the real inputs that can move EP001 forward now. Every request includes required evidence, safe post-arrival actions, and gates that remain closed.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Foundation requests', packet.foundationRequests.length],
            ['Downstream requests', packet.downstreamRequests.length],
            ['Decision rows', packet.verification.humanDecisionRows],
            ['Approvals', packet.verification.humanApprovalsIssued],
            ['Combination tests', packet.verification.simulatedCombinationCount],
            ['Authority leaks', packet.verification.simulatedAuthorityLeakCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-[var(--color-surface)] p-4">
              <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        {packet.foundationRequests.map((request) => (
          <article key={request.triggerId} className="studio-card p-4 sm:p-5">
            <p className="font-display text-xl font-bold">{request.triggerId}</p>
            <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">{request.arrivalClass} · {request.subject}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Required evidence</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">{request.requiredEvidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Safe after arrival</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">{request.safeActionsAfterArrival.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Still gated</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">{request.stillBlockedAfterArrival.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
          </article>
        ))}
      </section>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Reviewer rules</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{packet.reviewerInstructions.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">Package ready; evidence not received.</p>
        <p className="mt-1">No provider calls · no Blender launch · no paid requests · no Production writes · no auto-approval.</p>
        <p className="mt-3 break-all font-mono text-[11px]">External handoff package sha256: {packet.externalHandoffPackageSha256}</p>
      </section>
    </main>
  );
}
