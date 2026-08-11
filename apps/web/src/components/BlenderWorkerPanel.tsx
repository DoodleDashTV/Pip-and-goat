'use client';

import { useEffect, useState } from 'react';

export function BlenderWorkerPanel() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [test, setTest] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/production/launch?action=blender-status');
    setStatus(await res.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function selfTest() {
    setMessage(null);
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'blender-self-test' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? 'Self-test failed');
      return;
    }
    setTest(data.test);
    await refresh();
  }

  const blender = (status?.blender ?? {}) as {
    available?: boolean;
    bin?: string;
    version?: string | null;
    engines?: string[];
    message?: string;
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Infrastructure</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Blender Worker Health</h1>
        <p className="mt-3 text-[var(--muted)]">
          Self-test may render a primitive cube (infrastructure only — never Pip/Goat/production assets).
        </p>
      </header>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 text-sm">
        <ul className="space-y-2">
          <li>Worker configured: {String(status?.workerConfigured)}</li>
          <li>Worker online/offline: {status?.workerOnline ? 'online' : 'offline'}</li>
          <li>Blender executable: {blender.bin ?? '—'}</li>
          <li>Blender version: {blender.version ?? blender.message ?? '—'}</li>
          <li>Supported engines: {(blender.engines ?? []).join(', ') || '—'}</li>
          <li>GPU mode: {String(status?.gpuMode)}</li>
          <li>Queue length: {String(status?.queueLength ?? 0)}</li>
          <li>
            Current render:{' '}
            {status?.currentRender
              ? String((status.currentRender as { id?: string }).id)
              : 'none'}
          </li>
          <li>
            Last success:{' '}
            {status?.lastSuccessfulRender
              ? String((status.lastSuccessfulRender as { id?: string }).id)
              : 'none'}
          </li>
          <li>
            Last failure:{' '}
            {status?.lastFailure ? String((status.lastFailure as { id?: string }).id) : 'none'}
          </li>
        </ul>
        {!blender.available ? (
          <p className="mt-4 font-semibold text-rose-300">BLENDER EXECUTION REQUIRED</p>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-2xl border border-leaf-400/40 px-4 py-2 text-sm font-bold text-leaf-300"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void selfTest()}
          className="rounded-2xl bg-leaf-500 px-4 py-2 text-sm font-extrabold text-ink-950"
        >
          RUN WORKER SELF-TEST
        </button>
      </div>
      {message ? <p className="text-sm text-rose-300">{message}</p> : null}
      {test ? (
        <pre className="overflow-x-auto rounded-2xl bg-ink-950/50 p-4 text-xs">
          {JSON.stringify(test, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
