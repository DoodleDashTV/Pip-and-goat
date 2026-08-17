'use client';

import { useRef } from 'react';

export function PreviewBackupControls({
  busy,
  onExport,
  onImport,
}: {
  busy?: boolean;
  onExport: () => void;
  onImport: (text: string, byteLength: number, confirm: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold text-[var(--color-primary)] sm:w-auto"
        disabled={busy}
        onClick={onExport}
      >
        Export Preview Backup
      </button>
      <button
        type="button"
        className="inline-flex min-h-touch w-full items-center justify-center rounded-2xl border border-[var(--color-border)] px-4 text-sm font-bold text-[var(--color-primary)] sm:w-auto"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        Import Preview Backup
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const confirmReplace = window.confirm(
            'Replace the Preview data stored in this browser? This cannot be undone unless you exported a backup first.',
          );
          const reader = new FileReader();
          reader.onload = () => {
            onImport(String(reader.result ?? ''), file.size, confirmReplace);
          };
          reader.readAsText(file);
        }}
      />
    </div>
  );
}
