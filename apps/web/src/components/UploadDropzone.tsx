'use client';

import { useCallback, useState } from 'react';

export function UploadDropzone({
  entityCode,
  kind,
  accept,
  label,
  onDone,
}: {
  entityCode: string;
  kind?: string;
  accept: string;
  label: string;
  onDone?: (result: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setMessage(null);
      try {
        const form = new FormData();
        form.set('file', file);
        form.set('entityCode', entityCode);
        if (kind) form.set('kind', kind);
        const res = await fetch('/api/production/onboarding/upload', {
          method: 'POST',
          body: form,
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage(data.error ?? data.code ?? 'Upload failed');
          return;
        }
        setMessage(`Uploaded ${file.name} — validators ran. Not auto production-ready.`);
        onDone?.(data);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Upload failed');
      } finally {
        setBusy(false);
      }
    },
    [entityCode, kind, onDone],
  );

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={[
          'rounded-2xl border border-dashed px-4 py-6 text-center text-sm transition',
          drag ? 'border-leaf-400 bg-leaf-500/10' : 'border-[var(--line)] bg-ink-950/30',
        ].join(' ')}
      >
        <p className="font-semibold text-mist-100">{label}</p>
        <p className="mt-1 text-[var(--muted)]">Drag & drop or choose a file</p>
        <label className="mt-3 inline-block cursor-pointer rounded-xl bg-leaf-500 px-4 py-2 text-sm font-extrabold text-ink-950">
          {busy ? 'Uploading…' : 'Select file'}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      {message ? <p className="text-xs text-sun-400">{message}</p> : null}
    </div>
  );
}
