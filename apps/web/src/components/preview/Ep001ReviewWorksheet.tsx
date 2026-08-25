'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  EP001_REVIEW_ITEMS,
  EP001_REVIEW_NOTES_MAX_CHARS,
  buildEp001ReviewExport,
  createEmptyEp001ReviewWorksheet,
  readEp001ReviewWorksheet,
  writeEp001ReviewWorksheet,
  type Ep001ReviewDisposition,
  type Ep001ReviewItemId,
  type Ep001ReviewStorage,
  type Ep001ReviewWorksheet as Worksheet,
} from '@/lib/tivvlejoy-ep001-review-worksheet';

const DISPOSITION_OPTIONS: Array<{ value: Ep001ReviewDisposition; label: string }> = [
  { value: 'IN_REVIEW', label: 'Still reviewing' },
  { value: 'NEEDS_CHANGES', label: 'Needs changes' },
  { value: 'READY_FOR_LATER_APPROVAL', label: 'Ready for later approval' },
];

function browserReviewStorage(): Ep001ReviewStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function Ep001ReviewWorksheet({
  packageSha256,
  workingTitle,
}: {
  packageSha256: string;
  workingTitle: string;
}) {
  const [worksheet, setWorksheet] = useState<Worksheet>(() =>
    createEmptyEp001ReviewWorksheet(packageSha256),
  );
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState('Loading the worksheet stored in this browser…');

  useEffect(() => {
    const storage = browserReviewStorage();
    setWorksheet(
      storage
        ? readEp001ReviewWorksheet(storage, packageSha256)
        : createEmptyEp001ReviewWorksheet(packageSha256),
    );
    setHydrated(true);
    setMessage(
      storage
        ? 'Saved only in this browser. No production or approval gate is changed.'
        : 'Browser storage is unavailable. Export the worksheet to preserve any notes.',
    );
  }, [packageSha256]);

  const persist = useCallback((next: Worksheet) => {
    const stamped = { ...next, savedAt: new Date().toISOString() };
    setWorksheet(stamped);
    const storage = browserReviewStorage();
    const saved = storage ? writeEp001ReviewWorksheet(storage, stamped) : false;
    setMessage(
      saved
        ? 'Worksheet saved in this browser. No production or approval gate is changed.'
        : 'Browser storage is unavailable. Your current on-screen notes have not been exported.',
    );
  }, []);

  const toggleItem = (itemId: Ep001ReviewItemId) => {
    const selected = new Set(worksheet.completedItemIds);
    if (selected.has(itemId)) selected.delete(itemId);
    else selected.add(itemId);
    persist({
      ...worksheet,
      completedItemIds: EP001_REVIEW_ITEMS.map((item) => item.id).filter((id) => selected.has(id)),
    });
  };

  const downloadWorksheet = () => {
    const payload = buildEp001ReviewExport(worksheet, new Date().toISOString());
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tivvlejoy-ep001-review-worksheet.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Review handoff downloaded. It is not a story, visual, or production approval.');
  };

  const completedCount = worksheet.completedItemIds.length;

  return (
    <section id="worksheet" className="studio-card scroll-mt-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Browser-only worksheet
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
            Review {workingTitle}
          </h2>
        </div>
        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold text-[var(--color-text)]">
          {completedCount}/{EP001_REVIEW_ITEMS.length} checked
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
        Use this to collect your decisions while the character rigs are being finished. “Ready for
        later approval” is only a note; it cannot clear story, visual, render, or publishing gates.
      </p>

      <fieldset className="mt-5" disabled={!hydrated}>
        <legend className="font-display text-lg font-bold text-[var(--color-text)]">
          Review checklist
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {EP001_REVIEW_ITEMS.map((item) => {
            const checked = worksheet.completedItemIds.includes(item.id);
            return (
              <label
                key={item.id}
                className="flex min-h-touch cursor-pointer items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleItem(item.id)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                />
                <span>
                  <span className="block text-sm font-bold leading-5 text-[var(--color-text)]">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--color-text-muted)]">
                    {item.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,16rem)_1fr]">
        <label className="block">
          <span className="text-sm font-bold text-[var(--color-text)]">Review status</span>
          <select
            value={worksheet.disposition}
            disabled={!hydrated}
            onChange={(event) =>
              persist({
                ...worksheet,
                disposition: event.target.value as Ep001ReviewDisposition,
              })
            }
            className="field-input mt-2 w-full"
          >
            {DISPOSITION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="flex items-center justify-between gap-3 text-sm font-bold text-[var(--color-text)]">
            Review and handoff notes
            <span className="text-xs font-semibold text-[var(--color-text-muted)]">
              {worksheet.notes.length}/{EP001_REVIEW_NOTES_MAX_CHARS}
            </span>
          </span>
          <textarea
            value={worksheet.notes}
            disabled={!hydrated}
            maxLength={EP001_REVIEW_NOTES_MAX_CHARS}
            rows={6}
            placeholder="Write any story, camera, rig, or performance changes here."
            onChange={(event) => persist({ ...worksheet, notes: event.target.value })}
            className="field-input mt-2 w-full resize-y"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-sm leading-5 text-[var(--color-text-muted)]">
          {message}
        </p>
        <button
          type="button"
          disabled={!hydrated}
          onClick={downloadWorksheet}
          className="btn-primary w-full px-4 text-sm sm:w-auto"
        >
          Export review handoff
        </button>
      </div>

      <p className="mt-4 break-all font-mono text-[11px] text-[var(--color-text-muted)]">
        Bound package: {packageSha256}
      </p>
    </section>
  );
}
