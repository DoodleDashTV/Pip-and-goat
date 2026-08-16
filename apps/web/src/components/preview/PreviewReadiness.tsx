'use client';

import Link from 'next/link';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';

export function PreviewReadiness() {
  const { readiness, message, busy, reset } = usePreviewWorkspace();

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">
          Readiness
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">Preview readiness</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-muted)]">
          Calculated from this browser’s Preview workspace. This studio is not production-ready.
        </p>
      </header>
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      <p className="status-error inline-flex min-h-touch items-center gap-2 rounded-full px-3 py-2 text-sm font-bold">
        <span aria-hidden="true">×</span>
        <span>Production-ready: no</span>
      </p>
      <section className="studio-card space-y-3 p-6">
        {readiness.items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-semibold">{item.label}</p>
              <p className="text-sm text-[var(--color-text-muted)]">{item.detail}</p>
            </div>
            <Link
              href={item.href}
              className={`inline-flex min-h-touch items-center justify-center rounded-full px-3 py-1 text-sm font-bold ${
                item.state === 'READY'
                  ? 'status-success'
                  : item.state === 'CLOSED'
                    ? 'status-error'
                    : 'status-warning'
              }`}
            >
              {item.state} · Open
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
