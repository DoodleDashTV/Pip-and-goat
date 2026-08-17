'use client';

import {
  connectionStatusLabel,
  durabilityLabel,
  lastSuccessfulSaveLabel,
  persistenceModeLabel,
  previewDatabaseHeadline,
} from '@/lib/persistence/labels';
import type { SafePersistenceSnapshot } from '@/lib/persistence/types';

export function ConnectionReadinessPanel({ snapshot }: { snapshot: SafePersistenceSnapshot }) {
  const rows: Array<{ label: string; value: string; tone: 'ok' | 'warn' | 'blocked' }> = [
    {
      label: 'Selected persistence mode',
      value: persistenceModeLabel(snapshot.selectedPersistenceMode),
      tone: 'warn',
    },
    {
      label: 'Active persistence mode',
      value: persistenceModeLabel(snapshot.activePersistenceMode),
      tone: snapshot.activePersistenceMode === 'preview-localStorage' ? 'ok' : 'blocked',
    },
    {
      label: 'Browser storage',
      value: connectionStatusLabel(snapshot.browserStorage),
      tone: 'ok',
    },
    {
      label: 'Preview database',
      value: connectionStatusLabel(snapshot.previewDatabase),
      tone: 'blocked',
    },
    {
      label: 'Production database',
      value: connectionStatusLabel(snapshot.productionDatabase),
      tone: 'blocked',
    },
    {
      label: 'Backup availability',
      value: snapshot.backupAvailable ? 'Available' : 'Not connected',
      tone: snapshot.backupAvailable ? 'ok' : 'blocked',
    },
    {
      label: 'Last successful save',
      value: lastSuccessfulSaveLabel(snapshot.lastSuccessfulSave),
      tone: snapshot.lastSuccessfulSave === 'browser-only' ? 'warn' : 'blocked',
    },
    {
      label: 'Durability',
      value: durabilityLabel(snapshot),
      tone: 'warn',
    },
  ];

  return (
    <section className="studio-card overflow-x-hidden p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
        Connection readiness
      </p>
      <h2 className="mt-2 font-display text-xl font-semibold text-[var(--color-text)]">
        Persistence connection status
      </h2>
      <p className="mt-2 break-words text-sm font-bold leading-6 text-[var(--color-text)]">
        {previewDatabaseHeadline()}
      </p>
      <p className="mt-1 break-words text-sm leading-6 text-[var(--color-text-muted)]">
        Cloud persistence is unavailable. This Preview workspace stays in the selected browser
        storage. Failed database or production writes are not rewritten to localStorage.
      </p>
      <dl className="mt-4 grid gap-3">
        {rows.map((row) => {
          const toneClass =
            row.tone === 'ok'
              ? 'border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success-foreground)]'
              : row.tone === 'blocked'
                ? 'border-[var(--color-error)] bg-[var(--color-error-soft)] text-[var(--color-error-foreground)]'
                : 'border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning-foreground)]';
          return (
            <div key={row.label} className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
              <dt className="text-xs font-bold uppercase tracking-[0.14em]">{row.label}</dt>
              <dd className="mt-1 break-words text-sm font-bold leading-5">{row.value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
