'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function BlenderWorkerPanel() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [panel, setPanel] = useState<Record<string, unknown> | null>(null);
  const [test, setTest] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const [launchRes, setupRes] = await Promise.all([
      fetch('/api/production/launch?action=blender-status'),
      fetch('/api/production/setup'),
    ]);
    setStatus(await launchRes.json());
    const setup = await setupRes.json();
    setPanel(setup.blender ?? null);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function selfTest() {
    setMessage(null);
    const res = await fetch('/api/production/setup', {
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
    if (data.blender) setPanel(data.blender);
    await refresh();
  }

  const blender = (status?.blender ?? {}) as {
    available?: boolean;
    bin?: string;
    version?: string | null;
    engines?: string[];
    message?: string;
  };

  const yn = (v: unknown) => (v ? 'YES' : 'NO');

  return (
    <div className="mx-auto max-w-3xl space-y-6 overflow-x-hidden px-1">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Infrastructure</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Blender Worker Health</h1>
        <p className="mt-3 text-[var(--muted)]">
          Self-test may render a primitive cube (infrastructure only — never Pip/Goat/production
          assets).
        </p>
        <Link
          href="/production-setup#blender"
          className="mt-3 inline-block text-sm text-leaf-300 underline"
        >
          Back to Production Setup
        </Link>
      </header>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          {[
            ['Blender installed', yn(panel?.blenderInstalled ?? blender.available)],
            ['Version', String(panel?.version ?? blender.version ?? blender.message ?? '—')],
            [
              'EEVEE available',
              yn(panel?.eeveeAvailable ?? (blender.engines ?? []).includes('EEVEE')),
            ],
            ['FFmpeg available', yn(panel?.ffmpegAvailable)],
            ['Worker connected', yn(panel?.workerConnected ?? status?.workerOnline)],
            ['Render writable', yn(panel?.renderWritable)],
            ['Storage connected', yn(panel?.storageConnected)],
            ['Queue length', String(status?.queueLength ?? 0)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-ink-950/40 px-4 py-3">
              <dt className="text-[10px] font-bold uppercase text-sun-400">{k}</dt>
              <dd className="mt-1 break-all font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {!blender.available ? (
          <p className="mt-4 font-semibold text-rose-300">BLENDER EXECUTION REQUIRED</p>
        ) : null}
      </section>

      <button
        type="button"
        onClick={() => void selfTest()}
        className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-leaf-500 px-4 py-3 text-base font-extrabold text-ink-950"
      >
        RUN BLENDER SELF-TEST
      </button>
      <button
        type="button"
        onClick={() => void refresh()}
        className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-leaf-400/40 px-4 py-3 text-sm font-bold text-leaf-300"
      >
        Refresh
      </button>
      {message ? <p className="text-sm text-rose-300">{message}</p> : null}
      {test ? (
        <pre className="overflow-x-auto rounded-2xl bg-ink-950/50 p-4 text-xs">
          {JSON.stringify(test, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
