'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Field = {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};

export function StudioActionForm({
  actionPath,
  fields,
  submitLabel,
  successRedirect,
}: {
  actionPath: string;
  fields: Field[];
  submitLabel: string;
  successRedirect?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body: Record<string, string> = {};
        for (const field of fields) {
          body[field.name] = String(form.get(field.name) ?? '');
        }
        startTransition(async () => {
          setMessage(null);
          const response = await fetch(actionPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
            redirectTo?: string;
            episodeId?: string;
          };
          if (!response.ok) {
            setMessage(payload.error ?? payload.message ?? 'Request failed');
            return;
          }
          const next =
            successRedirect ??
            payload.redirectTo ??
            (payload.episodeId ? `/episodes/${payload.episodeId}` : null);
          if (next) {
            router.push(next);
            router.refresh();
            return;
          }
          setMessage(payload.message ?? 'Saved');
          router.refresh();
        });
      }}
    >
      {fields.map((field) => (
        <label key={field.name} className="block text-sm">
          <span className="font-semibold text-mist-100">{field.label}</span>
          {field.type === 'textarea' ? (
            <textarea
              name={field.name}
              placeholder={field.placeholder}
              required
              rows={4}
              className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-ink-950/50 px-3 py-2 text-mist-100"
            />
          ) : field.type === 'select' ? (
            <select
              name={field.name}
              required
              defaultValue={field.options?.[0]?.value}
              className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-ink-950/50 px-3 py-2 text-mist-100"
            >
              {(field.options ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={field.name}
              placeholder={field.placeholder}
              required
              className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-ink-950/50 px-3 py-2 text-mist-100"
            />
          )}
        </label>
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl bg-leaf-500 px-5 py-3 text-sm font-extrabold text-ink-950 transition hover:bg-leaf-400 disabled:opacity-60"
      >
        {pending ? 'Working…' : submitLabel}
      </button>
      {message ? <p className="text-sm text-sun-300">{message}</p> : null}
    </form>
  );
}
