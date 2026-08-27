import Link from 'next/link';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';

export const metadata = {
  title: 'Episode 1 Human Gates | TivvleJoy',
  description: 'Read-only SHA-bound human decision packet for EP001.',
};

export default function EpisodeOneHumanGatesPage() {
  const packet = compileEp001HumanGatePacket();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/scenery-deep-inspection" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Scenery deep inspection</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 manual authority</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Human decision packet</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Every human decision is listed against an immutable subject hash. No approval transfers to changed audio, rigs, scenery, playblasts, packages, or render authorization.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-5">
          {[
            ['Decision rows', packet.metrics.totalDecisionRows],
            ['Admission', packet.metrics.episodeAdmissionRows],
            ['Voice', packet.metrics.voiceDecisionRows],
            ['Scenery', packet.metrics.sceneryDecisionRows],
            ['Approved', packet.metrics.approvedRows],
          ].map(([label, value]) => <div key={String(label)} className="bg-[var(--color-surface)] p-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>)}
        </dl>
      </section>

      <section className="space-y-3">
        {packet.rows.map((row) => (
          <article key={row.decisionId} className="studio-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{row.subjectLabel}</p><p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">{row.gateClass} · {row.decisionId}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">PENDING</span></div>
            <p className="mt-3 break-all font-mono text-[11px] text-[var(--color-text-muted)]">Binding SHA-256: {row.bindingSha256}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{row.reviewerMustInspect.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        ))}
      </section>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Approval sequencing</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{packet.sequencingRules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">23 decisions prepared. 0 approvals issued.</p>
        <p className="mt-1">No provider calls · no Blender launch · no paid requests · no Production writes · no auto-approval.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Human gate packet sha256: {packet.humanGatePacketSha256}</p>
      </section>
    </main>
  );
}
