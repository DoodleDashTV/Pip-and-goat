import Link from 'next/link';

export default function StudioNotFound() {
  return (
    <section className="studio-card space-y-4 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Studio preview
      </p>
      <h1 className="font-display text-3xl font-bold">Not available yet</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        That page is not part of this public preview. Closed production gates stay closed.
      </p>
      <Link href="/" className="btn-primary px-5 py-3 text-sm">
        Back to dashboard
      </Link>
    </section>
  );
}
