'use client';

import { useCallback, useId, useRef, useState } from 'react';

export type UploadResult = {
  checksum?: string;
  status?: string;
  previewUrl?: string | null;
  referenceImage?: { id: string; assetId: string | null; reviewStatus: string };
  readiness?: Record<string, string | number | boolean | null>;
  stored?: { checksum?: string; uri?: string };
  intake?: { version?: number; approvalStatus?: string };
  error?: string;
  code?: string;
};

const IMAGE_ACCEPT =
  'image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp,image/*';

export function UploadDropzone({
  entityCode,
  kind,
  accept,
  label,
  buttonLabel = 'Select file',
  large = false,
  onDone,
}: {
  entityCode: string;
  kind?: string;
  accept: string;
  label: string;
  buttonLabel?: string;
  /** Mobile-first large tap target */
  large?: boolean;
  onDone?: (result: UploadResult, file: File) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

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
        const data = (await res.json()) as UploadResult;
        if (!res.ok) {
          setMessage(data.error ?? data.code ?? 'Upload failed');
          return;
        }
        setMessage(`Uploaded ${file.name}`);
        onDone?.(data, file);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Upload failed');
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [entityCode, kind, onDone],
  );

  const resolvedAccept =
    kind === 'PRIMARY_CANONICAL_REFERENCE' || accept.includes('image')
      ? IMAGE_ACCEPT
      : accept;

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
          'rounded-2xl border border-dashed px-4 text-center transition',
          large ? 'py-8' : 'py-6',
          drag ? 'border-leaf-400 bg-leaf-500/10' : 'border-[var(--line)] bg-ink-950/30',
        ].join(' ')}
      >
        <p className={`font-semibold text-mist-100 ${large ? 'text-base' : 'text-sm'}`}>{label}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Tap to choose from Photos or Files. Drag-and-drop optional on desktop.
        </p>
        <label
          htmlFor={inputId}
          className={[
            'mt-4 inline-flex w-full max-w-sm cursor-pointer items-center justify-center rounded-2xl bg-leaf-500 font-extrabold text-ink-950',
            large ? 'min-h-[56px] px-5 py-4 text-base' : 'px-4 py-2 text-sm',
            busy ? 'opacity-70' : '',
          ].join(' ')}
        >
          {busy ? 'Uploading…' : buttonLabel}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={resolvedAccept}
          className="sr-only"
          disabled={busy}
          // Helps iOS Photos/Files picker without requiring camera
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {message ? <p className="break-all text-xs text-sun-400">{message}</p> : null}
    </div>
  );
}
