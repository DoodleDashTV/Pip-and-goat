import Link from 'next/link';
import { compileEp001RealScenerySourceInspection } from '@/lib/tivvlejoy-ep001-real-scenery-source-inspection';

export const metadata = {
  title: 'Episode 1 Real Scenery Source Inspection | TivvleJoy',
  description: 'Read-only static inspection ledger for real EP001 scenery source packages.',
};

export default function Ep001RealScenerySourceInspectionPage() {
  const inspection = compileEp001RealScenerySourceInspection();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/scenery-admission-readiness" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Scenery admission readiness</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 real source evidence</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Real scenery source inspection</h1></div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Real bytes inspected · admission closed</span>
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">Static inspection of the actual Village, Village texture/project, Stylized Forest texture, and World Shader packages in the TivvleJoy Library. No embedded scripts or Blender files were executed.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Inspected sources</p><p className="mt-1 font-display text-2xl font-bold">{inspection.metrics.inspectedSourceCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Slots with observed candidates</p><p className="mt-1 font-display text-2xl font-bold">{inspection.metrics.sourceCapabilitySlotCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Unproven slots</p><p className="mt-1 font-display text-2xl font-bold">{inspection.metrics.unsupportedOrUnprovenSlotCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Admitted</p><p className="mt-1 font-display text-2xl font-bold">0</p></div>
        </div>
      </section>

      <section className="space-y-3">{inspection.sources.map((source) => (
        <article key={source.sourceId} className="studio-card p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{source.sourceId}</p><h2 className="mt-1 font-display text-xl font-bold">{source.label}</h2></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">CRC CLEAN · NOT ADMITTED</span></div>
          <p className="mt-3 break-all font-mono text-[11px] text-[var(--color-text-muted)]">{source.libraryPath}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm"><b>Bytes:</b> {source.exactByteSize.toLocaleString()}</div><div className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm"><b>Entries:</b> {source.archiveEntryCount}</div><div className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm"><b>Format:</b> {source.formatSummary}</div></div>
          <p className="mt-3 break-all font-mono text-[11px]">SHA-256: {source.sha256}</p>
          {source.blenderHeader ? <p className="mt-2 text-sm">Observed Blender header: <span className="font-mono">{source.blenderHeader}</span> — file not executed.</p> : null}
          <p className="mt-3 text-sm"><b>Candidate roles:</b> {source.candidateRoles.length ? source.candidateRoles.join(', ') : 'Texture/support source only; no geometry role claimed.'}</p>
        </article>
      ))}</section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">17-slot capability assessment</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{inspection.slotAssessments.map((slot) => <article key={slot.slotId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{slot.slotId}</p><p className="mt-1 font-bold">{slot.semanticRole}</p><p className="mt-2 text-xs text-[var(--color-text-muted)]">{slot.state}</p><p className="mt-2 text-sm">Candidates: {slot.candidateSourceIds.length ? slot.candidateSourceIds.join(', ') : 'none proven from inspected bytes'}</p></article>)}</div></section>
      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Observed limitations</p><ul className="mt-4 grid gap-2 sm:grid-cols-2">{inspection.observations.map((item) => <li key={item} className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]">{item}</li>)}</ul></section>
      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]"><p className="font-bold">Real-source inspection completed without execution</p><p className="mt-1">Real source bytes observed · archive integrity checked · Blender not launched · no embedded scripts executed · licenses/human approval still open</p><p className="mt-3 break-all font-mono text-[11px]">Inspection sha256:{inspection.realScenerySourceInspectionSha256}</p></section>
    </main>
  );
}
