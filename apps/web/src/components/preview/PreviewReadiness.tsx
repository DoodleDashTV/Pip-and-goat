'use client';

import Link from 'next/link';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewEmptyState, PreviewPageIntro } from './PreviewEmptyState';

export function PreviewReadiness() {
  const { workspace, readiness, message, busy, reset, exportBackup, importBackup } =
    usePreviewWorkspace();
  const hasEpisode = workspace.episodes.length > 0;

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Readiness"
        title="Check the Preview list"
        instruction="This list is calculated from this browser only. Green preview items still do not make the studio production-ready."
      />
      <PreviewBanner
        busy={busy}
        onReset={() => reset()}
        onExport={() => exportBackup()}
        onImport={(text, byteLength, confirm) => importBackup(text, byteLength, confirm)}
      />
      <PreviewMessage message={message} />
      <p className="status-error inline-flex min-h-touch items-center gap-2 rounded-full px-3 py-2 text-sm font-bold">
        <span aria-hidden="true">×</span>
        <span>Production-ready: no</span>
      </p>
      {!hasEpisode ? (
        <PreviewEmptyState
          title="Nothing to check yet"
          body="This is step 6 of 7. Create an episode and add an asset and a voice note so the preview checklist can fill in. Closed gates stay closed."
          href="/new-episode"
          actionLabel="Go to New Episode"
        />
      ) : null}
      <section className="studio-card space-y-3 p-4 sm:p-6">
        {readiness.items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-semibold">{item.label}</p>
              <p className="break-words text-sm text-[var(--color-text-muted)]">{item.detail}</p>
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
