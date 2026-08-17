export default function StudioLoading() {
  return (
    <section className="studio-card space-y-3 p-6" aria-busy="true" aria-live="polite">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
        TivvleJoy
      </p>
      <h1 className="font-display text-2xl font-bold">Loading studio…</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        Closed gates stay closed. Paid resources stay unauthorized.
      </p>
    </section>
  );
}
