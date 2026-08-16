'use client';

import { PREVIEW_PUBLIC_BANNER } from '@/lib/preview-workspace/types';

export function PreviewBanner({
  onReset,
  busy,
}: {
  onReset?: () => void;
  busy?: boolean;
}) {
  return (
    <section className="studio-card space-y-3 border-[var(--color-highlight)] p-4 sm:p-5">
      <p className="break-words text-sm font-bold leading-6 text-[var(--color-text)]">
        {PREVIEW_PUBLIC_BANNER}
      </p>
      {onReset ? (
        <button
          type="button"
          className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold text-[var(--color-primary)] sm:w-auto"
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
      <span className="min-w-0 break-words">{message.text}</span>
    </p>
  );
}
