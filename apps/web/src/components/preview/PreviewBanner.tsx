'use client';

export function PreviewBanner({
  onReset,
  busy,
}: {
  onReset?: () => void;
  busy?: boolean;
}) {
  return (
    <section className="studio-card space-y-3 border-[var(--color-highlight)] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Preview workspace
      </p>
      <p className="text-sm text-[var(--color-text)]">
        This browser only. Not durable production data. Theatrical gates stay closed. Paid GPU stays
        unauthorized. Pip/Goat theatrical binding stays incomplete.
      </p>
      {onReset ? (
        <button
          type="button"
          className="inline-flex min-h-touch items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold text-[var(--color-primary)]"
          disabled={busy}
          onClick={onReset}
        >
          Reset Preview workspace
        </button>
      ) : null}
    </section>
  );
}

export function PreviewMessage({
  message,
}: {
  message: { tone: 'ok' | 'error'; text: string } | null;
}) {
  if (!message) return null;
  const cls = message.tone === 'ok' ? 'status-success' : 'status-error';
  return (
    <p className={`${cls} inline-flex min-h-touch items-center gap-2 rounded-full px-3 py-2 text-sm font-bold`}>
      <span aria-hidden="true">{message.tone === 'ok' ? '✓' : '×'}</span>
      <span>{message.text}</span>
    </p>
  );
}
