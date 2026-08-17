'use client';

import { useState } from 'react';

export function BuildEpisodeButton({
  episodeId,
  durationTargetSec = 30,
}: {
  episodeId: string;
  durationTargetSec?: 15 | 30 | 45 | 60;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/production/build-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId, durationTargetSec }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? data.code ?? 'Build failed');
        return;
      }
      const stages = (data.run?.stages ?? [])
        .map((s: { stage: string; status: string; blockedReason?: string | null }) => {
          const reason = s.blockedReason ? ` — ${s.blockedReason}` : '';
          return `${s.stage}: ${s.status}${reason}`;
        })
        .join('\n');
      setResult(`Run ${data.run.id} · ${data.run.status}\n${stages}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="btn-highlight px-5 py-3 text-sm"
      >
        {busy ? 'Building…' : 'BUILD EPISODE'}
      </button>
      {error ? (
        <pre className="status-error whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm">
          <span className="font-bold">Error: </span>
          {error}
        </pre>
      ) : null}
      {result ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 text-xs text-[var(--color-text)]">
          {result}
        </pre>
      ) : null}
    </div>
  );
}
