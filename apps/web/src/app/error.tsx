'use client';

export default function StudioError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="studio-card space-y-4 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Studio preview
      </p>
      <h1 className="font-display text-3xl font-bold">Not available yet</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        This control needs the local studio database or a protected service. The public preview
        does not open theatrical gates, start paid jobs, or expose credentials.
      </p>
      <button type="button" className="btn-primary px-5 py-3 text-sm" onClick={() => reset()}>
        Try again
      </button>
    </section>
  );
}
