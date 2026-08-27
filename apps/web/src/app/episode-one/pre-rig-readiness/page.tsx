import Link from 'next/link';
import { compileEp001PreRigReadinessAudit } from '@/lib/tivvlejoy-ep001-pre-rig-readiness-audit';

export const metadata = {
  title: 'Episode 1 Pre-Rig Readiness Audit | TivvleJoy',
  description: 'Read-only audit of autonomous readiness and the remaining real external blockers for EP001.',
};

export default function Ep001PreRigReadinessPage() {
  const audit = compileEp001PreRigReadinessAudit();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/production-gateway" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Episode 1 production gateway</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 convergence</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Pre-rig readiness audit</h1></div><span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Autonomous preparation exhausted</span></div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">This audit separates completed software preparation from real evidence that cannot be invented: artist rig bytes, provider-generated voice receipts, source/license-backed scenery bindings, and explicit human decisions.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Audit rows</p><p className="mt-1 font-display text-2xl font-bold">{audit.metrics.auditRowCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Planning ready</p><p className="mt-1 font-display text-2xl font-bold">{audit.metrics.planningReadyCount} / {audit.metrics.auditRowCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Character files present</p><p className="mt-1 font-display text-2xl font-bold">0 / 2</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Useful GPU spend now</p><p className="mt-1 font-display text-lg font-bold">No</p></div>
        </div>
      </section>

      <section className="space-y-3">{audit.rows.map((row) => <article key={row.id} className="studio-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{row.id} · {row.class}</p><h2 className="mt-1 font-display text-lg font-bold">{row.label}</h2></div><span className={row.realEvidenceComplete ? 'status-success rounded-full px-3 py-1 text-xs font-bold' : 'status-warning rounded-full px-3 py-1 text-xs font-bold'}>{row.realEvidenceComplete ? 'REAL EVIDENCE COMPLETE' : 'PLANNING READY · REAL EVIDENCE OPEN'}</span></div>{row.blocker ? <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">{row.blocker}</p> : null}<p className="mt-3 break-all font-mono text-[11px] text-[var(--color-text-muted)]">Artifact: {row.artifactSha256}</p></article>)}</section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Physical character blockers</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{audit.physicalAssetBlockers.map((item) => <article key={item.characterId} className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4"><p className="font-display text-xl font-bold">{item.characterId}</p><p className="mt-2 text-sm leading-6">{item.reason}</p></article>)}</div></section>
      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">What happens immediately on delivery</p><ol className="mt-4 space-y-2">{audit.nextArrivalSequence.map((step, index) => <li key={step} className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm"><span className="mr-2 font-mono font-bold text-[var(--color-primary)]">{String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol></section>
      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]"><p className="font-bold">No useful paid GPU job exists before real rig arrival</p><p className="mt-1">{audit.currentConclusion.reasonPaidComputeNotUsefulYet}</p><p className="mt-3 break-all font-mono text-[11px]">Pre-rig audit sha256:{audit.preRigReadinessAuditSha256}</p></section>
    </main>
  );
}
