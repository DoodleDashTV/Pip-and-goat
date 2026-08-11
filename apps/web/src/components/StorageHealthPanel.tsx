'use client';

import { useState } from 'react';

type StorageHealth = {
  provider: string;
  configured: boolean;
  durable: boolean;
  writable: boolean | null;
  readable: boolean | null;
  bucket: string | null;
  endpoint: string | null;
  region: string | null;
  root: string | null;
  banner: string;
  message: string;
  requiredConfig: string[];
  lastSuccessfulWrite: string | null;
  lastFailedWrite: string | null;
  prefixes?: string[];
};

export function StorageHealthPanel({ initial }: { initial: StorageHealth }) {
  const [storage, setStorage] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function runSelfTest() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/production/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'self-test' }),
      });
      const data = await res.json();
      if (data.storage) setStorage(data.storage);
      if (!res.ok) {
        setResult(data.error ?? 'Self-test failed');
        return;
      }
      setResult(
        data.result?.ok
          ? `Self-test OK · provider=${data.result.provider} · hash matched · test object deleted`
          : `Self-test FAILED · ${data.result?.error ?? 'unknown'}`,
      );
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Self-test failed');
    } finally {
      setBusy(false);
    }
  }

  const yn = (v: boolean | null) => (v == null ? 'UNKNOWN' : v ? 'YES' : 'NO');

  return (
    <section
      className={[
        'rounded-[1.75rem] border p-4 sm:p-5',
        storage.durable ? 'border-leaf-400/30 bg-leaf-500/10' : 'border-sun-400/40 bg-sun-500/10',
      ].join(' ')}
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-sun-300">{storage.banner}</p>
      <h2 className="mt-2 font-display text-2xl font-bold">Production storage</h2>
      <p className="mt-2 text-sm text-mist-100">{storage.message}</p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">Provider</dt>
          <dd className="mt-1 font-semibold">{storage.provider}</dd>
        </div>
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">Configured</dt>
          <dd className="mt-1 font-semibold">{yn(storage.configured)}</dd>
        </div>
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">Writable</dt>
          <dd className="mt-1 font-semibold">{yn(storage.writable)}</dd>
        </div>
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">Readable</dt>
          <dd className="mt-1 font-semibold">{yn(storage.readable)}</dd>
        </div>
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">Bucket</dt>
          <dd className="mt-1 break-all font-semibold">{storage.bucket ?? '—'}</dd>
        </div>
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">Endpoint</dt>
          <dd className="mt-1 break-all font-semibold">{storage.endpoint ?? '—'}</dd>
        </div>
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">
            Durability
          </dt>
          <dd className={`mt-1 font-semibold ${storage.durable ? 'text-leaf-300' : 'text-rose-300'}`}>
            {storage.durable ? 'DURABLE (S3-compatible)' : 'NOT DURABLE (local/ephemeral)'}
          </dd>
        </div>
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">Region</dt>
          <dd className="mt-1 font-semibold">{storage.region ?? '—'}</dd>
        </div>
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3 sm:col-span-2">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">
            Last successful write
          </dt>
          <dd className="mt-1 font-semibold">{storage.lastSuccessfulWrite ?? '—'}</dd>
        </div>
        <div className="rounded-2xl bg-ink-950/40 px-4 py-3 sm:col-span-2">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">
            Last failed write
          </dt>
          <dd className="mt-1 font-semibold text-rose-200">{storage.lastFailedWrite ?? '—'}</dd>
        </div>
      </dl>

      {!storage.durable ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-sun-100/90">
          {storage.requiredConfig.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void runSelfTest()}
        className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-leaf-500 px-4 py-3 text-base font-extrabold text-ink-950 disabled:opacity-60"
      >
        {busy ? 'Running…' : 'RUN STORAGE SELF-TEST'}
      </button>
      {result ? <p className="mt-3 break-words text-sm text-sun-300">{result}</p> : null}
      <p className="mt-3 text-xs text-[var(--muted)]">
        Credentials are never shown. Self-test writes a tiny object, reads it, verifies SHA-256, then
        deletes it.
      </p>
    </section>
  );
}
