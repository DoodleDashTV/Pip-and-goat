import Link from 'next/link';
import { compileEp001DeliveryArchiveManifest } from '@/lib/tivvlejoy-ep001-delivery-archive-manifest';

export const metadata = {
  title: 'Episode 1 Delivery Archive | TivvleJoy',
  description: 'Read-only archive manifest template for EP001 final delivery.',
};

export default function EpisodeOneDeliveryArchivePage() {
  const archive = compileEp001DeliveryArchiveManifest();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden"><div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6"><Link href="/episode-one/publishing-release" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Publishing release gate</Link><div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 preservation</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Delivery archive manifest</h1></div><span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Template only</span></div><p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">Defines the exact canonical artifacts, hashes, provenance receipts, and restore checks TivvleJoy will retain after Episode 1 is truly finished. No archive is written from this page.</p></div><div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-3"><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Artifacts</p><p className="mt-1 font-display text-2xl font-bold">{archive.artifacts.length}</p></div><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Present</p><p className="mt-1 font-display text-2xl font-bold">0</p></div><div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Archive writes</p><p className="mt-1 font-display text-lg font-bold">Blocked</p></div></div></section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Canonical delivery inventory</p><h2 className="mt-2 font-display text-2xl font-bold">Ten artifacts preserved by identity</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{archive.artifacts.map((item) => <article key={item.artifactId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{item.artifactId}</p><p className="mt-1 text-sm font-semibold">{item.label}</p><p className="mt-2 text-xs text-[var(--color-text-muted)]">Expected: {item.expectedType} · SHA not recorded · not present</p></article>)}</div></section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Preservation rules</p><ul className="mt-4 grid gap-2 sm:grid-cols-2">{archive.preservationRules.map((rule) => <li key={rule} className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]">{rule}</li>)}</ul></section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Restore proof</p><ol className="mt-4 space-y-2">{archive.restoreChecklist.map((item, index) => <li key={item} className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm"><span className="mr-2 font-bold text-[var(--color-primary)]">{index + 1}.</span>{item}</li>)}</ol></section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]"><p className="font-bold">Manifest definition only</p><p className="mt-1">No source bytes · no archive write · zero network/storage/Production mutations · publishing remains unauthorized</p><p className="mt-3 break-all font-mono text-[11px]">Archive manifest sha256:{archive.archiveManifestSha256}</p></section>
    </main>
  );
}
