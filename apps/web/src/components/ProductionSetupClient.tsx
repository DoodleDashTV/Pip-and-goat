'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type SetupState = 'READY' | 'ACTION_REQUIRED' | 'BLOCKED' | 'WARNING';

type SetupStep = {
  id: string;
  order: number;
  title: string;
  state: SetupState;
  summary: string;
  actionLabel: string;
  href: string;
  details?: string[];
};

type Checklist = {
  steps: SetupStep[];
  primaryAction: { label: string; href: string; reason: string };
  episodeId: string;
  draftEnabled: boolean;
  philosophy: string;
};

type BlenderPanel = {
  blenderInstalled: boolean;
  version: string | null;
  eeveeAvailable: boolean;
  ffmpegAvailable: boolean;
  workerConnected: boolean;
  renderWritable: boolean;
  storageConnected: boolean;
  storageDurable: boolean;
  selfTestOk: boolean;
  lastSelfTestStatus: string | null;
};

type StorageHealth = {
  provider: string;
  configured: boolean;
  durable: boolean;
  bucket: string | null;
  endpoint: string | null;
  banner: string;
  message: string;
  requiredConfig: string[];
  lastSuccessfulWrite: string | null;
  lastFailedWrite: string | null;
};

const STATE_STYLE: Record<SetupState, string> = {
  READY: 'bg-leaf-500/15 text-leaf-300',
  ACTION_REQUIRED: 'bg-sun-500/15 text-sun-300',
  BLOCKED: 'bg-rose-500/15 text-rose-200',
  WARNING: 'bg-sun-500/10 text-sun-200',
};

function yn(v: boolean) {
  return v ? 'YES' : 'NO';
}

export function ProductionSetupClient({
  initialChecklist,
  initialBlender,
  initialStorage,
}: {
  initialChecklist: Checklist;
  initialBlender: BlenderPanel;
  initialStorage: StorageHealth;
}) {
  const [checklist, setChecklist] = useState(initialChecklist);
  const [blender, setBlender] = useState(initialBlender);
  const [storage, setStorage] = useState(initialStorage);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [packagePreview, setPackagePreview] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...checklist.steps].sort((a, b) => a.order - b.order),
    [checklist.steps],
  );

  async function refresh() {
    const res = await fetch('/api/production/setup');
    const data = await res.json();
    if (data.checklist) setChecklist(data.checklist);
    if (data.blender) setBlender(data.blender);
    if (data.storage) setStorage(data.storage);
  }

  async function runStorageSelfTest() {
    setBusy('storage');
    setMessage(null);
    try {
      const res = await fetch('/api/production/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'storage-self-test' }),
      });
      const data = await res.json();
      if (data.checklist) setChecklist(data.checklist);
      setMessage(
        data.result?.ok
          ? 'Storage self-test passed (write → read → hash → delete).'
          : data.result?.error ?? data.error ?? 'Storage self-test failed',
      );
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function runBlenderSelfTest() {
    setBusy('blender');
    setMessage(null);
    try {
      const res = await fetch('/api/production/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'blender-self-test' }),
      });
      const data = await res.json();
      if (data.blender) setBlender(data.blender);
      if (data.checklist) setChecklist(data.checklist);
      setMessage(
        data.test?.status === 'SUCCEEDED'
          ? 'Blender self-test succeeded (primitive cube / infrastructure only — not Pip or Goat).'
          : data.test?.error ?? data.error ?? 'Blender self-test failed',
      );
    } finally {
      setBusy(null);
    }
  }

  async function exportPackage(characterCode: 'CHAR_PIP_001' | 'CHAR_GOAT_001') {
    setBusy(characterCode);
    setMessage(null);
    setPackagePreview(null);
    try {
      const res = await fetch('/api/production/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export-modeling-package', characterCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? 'Export failed');
        return;
      }
      setPackagePreview(data.download?.markdown ?? JSON.stringify(data.download?.json, null, 2));
      setMessage(
        `Exported ${characterCode} modeling package (specification only — NOT a .blend). Stored at ${data.download?.storageKeys?.markdown}`,
      );
      // Offer download on device
      const blob = new Blob([data.download?.markdown ?? ''], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${characterCode}-modeling-package.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 overflow-x-hidden px-1 pb-10">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">
          Production Setup
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">What do I need to do next?</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{checklist.philosophy}</p>
      </header>

      <section className="rounded-[1.75rem] border border-leaf-400/40 bg-leaf-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-leaf-300">Primary action</p>
        <p className="mt-2 text-sm text-mist-100">{checklist.primaryAction.reason}</p>
        <Link
          href={checklist.primaryAction.href}
          className="mt-4 flex min-h-[56px] items-center justify-center rounded-2xl bg-leaf-500 px-4 py-4 text-center text-base font-extrabold text-ink-950"
        >
          {checklist.primaryAction.label}
        </Link>
      </section>

      <section id="storage" className="scroll-mt-8 space-y-3 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-2xl font-bold">Durable storage</h2>
        <p className="text-sm text-[var(--muted)]">{storage.message}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
            <dt className="text-[10px] font-bold uppercase text-sun-400">Provider</dt>
            <dd className="font-semibold">{storage.provider}</dd>
          </div>
          <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
            <dt className="text-[10px] font-bold uppercase text-sun-400">Durable</dt>
            <dd className="font-semibold">{yn(storage.durable)}</dd>
          </div>
          <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
            <dt className="text-[10px] font-bold uppercase text-sun-400">Bucket</dt>
            <dd className="break-all font-semibold">{storage.bucket ?? '—'}</dd>
          </div>
          <div className="rounded-2xl bg-ink-950/40 px-4 py-3">
            <dt className="text-[10px] font-bold uppercase text-sun-400">Endpoint</dt>
            <dd className="break-all font-semibold">{storage.endpoint ?? '—'}</dd>
          </div>
        </dl>
        {!storage.durable ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-sun-100">
            {storage.requiredConfig.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          disabled={busy === 'storage'}
          onClick={() => void runStorageSelfTest()}
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-leaf-500 px-4 py-3 font-extrabold text-ink-950 disabled:opacity-60"
        >
          {busy === 'storage' ? 'Testing…' : 'TEST STORAGE'}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-bold">Setup checklist</h2>
        {ordered.map((step) => (
          <article
            key={step.id}
            className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Step {step.order}
                </p>
                <h3 className="mt-1 font-display text-xl font-bold">{step.title}</h3>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-extrabold ${STATE_STYLE[step.state]}`}
              >
                {step.state.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">{step.summary}</p>
            {step.details?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-sun-100">
                {step.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
            <Link
              href={step.href}
              className="mt-3 flex min-h-[52px] items-center justify-center rounded-2xl border border-leaf-400/40 bg-leaf-500/10 px-4 py-3 text-center text-sm font-extrabold text-leaf-300"
            >
              {step.actionLabel}
            </Link>
          </article>
        ))}
      </section>

      <section id="blender" className="scroll-mt-8 space-y-3 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-2xl font-bold">Blender readiness</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ['Blender installed', yn(blender.blenderInstalled)],
            ['Version', blender.version ?? '—'],
            ['EEVEE available', yn(blender.eeveeAvailable)],
            ['FFmpeg available', yn(blender.ffmpegAvailable)],
            ['Worker connected', yn(blender.workerConnected)],
            ['Render writable', yn(blender.renderWritable)],
            ['Storage connected', yn(blender.storageConnected)],
            ['Last self-test', blender.lastSelfTestStatus ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-ink-950/40 px-4 py-3">
              <dt className="text-[10px] font-bold uppercase text-sun-400">{k}</dt>
              <dd className="mt-1 break-all font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-[var(--muted)]">
          Self-test renders a tiny non-character diagnostic cube with EEVEE. It never fabricates Pip
          or Goat.
        </p>
        <button
          type="button"
          disabled={busy === 'blender'}
          onClick={() => void runBlenderSelfTest()}
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-leaf-500 px-4 py-3 font-extrabold text-ink-950 disabled:opacity-60"
        >
          {busy === 'blender' ? 'Running…' : 'RUN BLENDER SELF-TEST'}
        </button>
        <Link href="/blender-worker" className="block text-sm font-semibold text-leaf-300 underline">
          Open full Blender worker panel
        </Link>
      </section>

      <section className="space-y-3 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-2xl font-bold">Model creation assistant</h2>
        <p className="text-sm text-[var(--muted)]">
          Export a complete modeling specification from locked DNA + style. Give it to a Blender
          artist or 3D service. This is <span className="font-semibold text-mist-100">not</span> a
          `.blend` file.
        </p>
        <p className="text-sm text-sun-300">
          Optimize for high upfront character quality and very low per-episode cost after approval.
        </p>
        <button
          type="button"
          disabled={busy === 'CHAR_PIP_001'}
          onClick={() => void exportPackage('CHAR_PIP_001')}
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-sun-400/40 bg-sun-500/10 px-4 py-3 font-extrabold text-sun-200 disabled:opacity-60"
        >
          EXPORT PIP MODELING PACKAGE
        </button>
        <button
          type="button"
          disabled={busy === 'CHAR_GOAT_001'}
          onClick={() => void exportPackage('CHAR_GOAT_001')}
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-sun-400/40 bg-sun-500/10 px-4 py-3 font-extrabold text-sun-200 disabled:opacity-60"
        >
          EXPORT GOAT MODELING PACKAGE
        </button>
        {packagePreview ? (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-ink-950/60 p-3 text-xs text-mist-100">
            {packagePreview.slice(0, 4000)}
            {packagePreview.length > 4000 ? '\n…' : ''}
          </pre>
        ) : null}
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-2xl font-bold">First episode</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          [PRODUCTION TEST] Meadow Map Mystery — draft uses the cheapest appropriate profile first.
          Final is FINAL_1080P / 1080×1920 / 30 FPS / EEVEE only after draft approval. Paid AI video
          stays OFF.
        </p>
        <Link
          href={`/episodes/${checklist.episodeId}/readiness`}
          className="mt-4 flex min-h-[52px] items-center justify-center rounded-2xl bg-leaf-500 px-4 py-3 text-center font-extrabold text-ink-950"
        >
          {checklist.draftEnabled ? 'GENERATE FIRST DRAFT' : 'OPEN MEADOW MAP MYSTERY READINESS'}
        </Link>
      </section>

      {message ? <p className="break-words text-sm text-sun-300">{message}</p> : null}
    </div>
  );
}
