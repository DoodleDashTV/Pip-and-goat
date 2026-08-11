'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const STATE_COLOR: Record<string, string> = {
  READY: 'text-leaf-300',
  WARNING: 'text-sun-400',
  BLOCKED: 'text-rose-300',
  NOT_CONFIGURED: 'text-mist-200/70',
};

export function EpisodeReadinessClient({ episodeId }: { episodeId: string }) {
  const [data, setData] = useState<{
    items: Array<{ category: string; state: string; reason: string; fixHref: string }>;
    draftEnabled: boolean;
    canGenerateFinal: boolean;
    latestRun?: { id: string; status: string; currentStage: string | null; stages: Array<{ stage: string; status: string; blockedReason: string | null }> };
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/production/launch?action=episode-checklist&episodeId=${episodeId}`);
    setData(await res.json());
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/production/launch?action=episode-checklist&episodeId=${episodeId}`);
      setData(await res.json());
    })();
  }, [episodeId]);

  async function generateDraft() {
    setMessage(null);
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate-first-draft', episodeId }),
    });
    const body = await res.json();
    setMessage(res.ok ? `Draft pipeline run ${body.run.id} · ${body.run.status}` : body.error);
    await load();
  }

  async function generateFinal() {
    setMessage(null);
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate-final', episodeId }),
    });
    const body = await res.json();
    setMessage(res.ok ? JSON.stringify(body) : body.error);
    await load();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">First Episode</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Meadow Map Mystery Readiness</h1>
        <p className="mt-3 text-[var(--muted)]">
          Click any blocker to jump to the fix screen. GENERATE FIRST DRAFT stays disabled until STRICT assets are READY.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href={`/episodes/${episodeId}/shots`} className="text-leaf-300 underline">
            Shot Inspector
          </Link>
          <Link href={`/episodes/${episodeId}/draft-review`} className="text-leaf-300 underline">
            Draft Review
          </Link>
          <Link href="/asset-intake" className="text-leaf-300 underline">
            Asset Intake
          </Link>
        </div>
      </header>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <ul className="space-y-3">
          {(data?.items ?? []).map((item) => (
            <li key={item.category} className="rounded-2xl bg-ink-950/40 px-4 py-3 text-sm">
              <Link href={item.fixHref} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{item.category}</span>
                <span className={STATE_COLOR[item.state] ?? ''}>{item.state}</span>
              </Link>
              <p className="text-[var(--muted)]">{item.reason}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-bold">Production controls</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!data?.draftEnabled}
            onClick={() => void generateDraft()}
            className="rounded-2xl bg-leaf-500 px-5 py-3 text-sm font-extrabold text-ink-950 disabled:opacity-40"
          >
            GENERATE FIRST DRAFT
          </button>
          <button
            type="button"
            disabled={!data?.canGenerateFinal}
            onClick={() => void generateFinal()}
            className="rounded-2xl border border-leaf-400/40 px-5 py-3 text-sm font-bold text-leaf-300 disabled:opacity-40"
          >
            GENERATE FINAL
          </button>
        </div>
        {message ? <pre className="mt-4 whitespace-pre-wrap text-xs text-sun-400">{message}</pre> : null}
        {data?.latestRun ? (
          <div className="mt-4 text-sm text-[var(--muted)]">
            Latest run {data.latestRun.id.slice(0, 8)}… · {data.latestRun.status} ·{' '}
            {data.latestRun.currentStage}
            <ul className="mt-2 space-y-1">
              {data.latestRun.stages?.map((s) => (
                <li key={s.stage}>
                  {s.stage}: {s.status}
                  {s.blockedReason ? ` — ${s.blockedReason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
