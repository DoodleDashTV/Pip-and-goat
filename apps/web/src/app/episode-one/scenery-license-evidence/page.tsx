import Link from 'next/link';
import { compileEp001SceneryLicenseEvidence } from '@/lib/tivvlejoy-ep001-scenery-license-evidence';

export const metadata = {
  title: 'Episode 1 Scenery License Evidence | TivvleJoy',
  description: 'Read-only commercial-use evidence gate for purchased EP001 scenery sources.',
};

export default function EpisodeOneSceneryLicenseEvidencePage() {
  const evidence = compileEp001SceneryLicenseEvidence();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/scenery-gap-closure" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Scenery capability closure</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 scenery provenance</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Commercial-use evidence gate</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Every statically inspected source and supporting commercial dependency is represented here. Capability does not become admission until exact purchase and license evidence is hash-bound and human-reviewed.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-5">
          {[
            ['Source records', evidence.metrics.sourceRecordCount],
            ['Public matches', evidence.metrics.publicMarketplaceCandidateCount],
            ['Evidence bound', evidence.metrics.evidenceBoundCount],
            ['Commercial verified', evidence.metrics.commercialUseVerifiedCount],
            ['Admitted', evidence.metrics.admittedCount],
          ].map(([label, value]) => <div key={String(label)} className="bg-[var(--color-surface)] p-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>)}
        </dl>
      </section>

      <section className="space-y-3">
        {evidence.records.map((record) => (
          <article key={record.sourceId} className="studio-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="break-all font-mono text-xs font-bold text-[var(--color-primary)]">{record.sourceId}</p><p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">{record.dependencyClass}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">AWAITING EVIDENCE</span></div>
            {record.publicMarketplaceCandidate ? (
              <div className="mt-3 rounded-2xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-3 text-sm leading-6 text-[var(--color-success-foreground)]">
                <p className="font-bold">Strong public marketplace match · still not purchase proof</p>
                <p>{record.publicMarketplaceCandidate.marketplace} · {record.publicMarketplaceCandidate.productTitle} · product #{record.publicMarketplaceCandidate.productId} · {record.publicMarketplaceCandidate.publicListingLicenseLabel}</p>
                <p className="mt-1">{record.publicMarketplaceCandidate.publicTermsSummary}</p>
              </div>
            ) : null}
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">Purchase receipt: absent · license hash: absent · commercial use: unverified · human review: absent · admission: blocked</p>
          </article>
        ))}
      </section>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Evidence required before admission</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{evidence.acceptedEvidenceClasses.map((item) => <li key={item}>{item}</li>)}</ul>
        <h3 className="mt-6 font-display text-xl font-bold">Fail-closed rules</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{evidence.rejectionRules.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">No license approval is implied by source possession or a public listing match.</p>
        <p className="mt-1">Capability complete · licenses unverified · Blender not launched · human approval absent · Production writes blocked.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Scenery license evidence sha256: {evidence.sceneryLicenseEvidenceSha256}</p>
      </section>
    </main>
  );
}
