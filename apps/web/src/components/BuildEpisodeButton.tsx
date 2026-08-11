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
        className="rounded-2xl bg-leaf-500 px-5 py-3 text-sm font-extrabold text-ink-950 transition hover:bg-leaf-400 disabled:opacity-50"
      >
        {busy ? 'Building…' : 'BUILD EPISODE'}
      </button>
      {error ? <pre className="whitespace-pre-wrap text-sm text-rose-300">{error}</pre> : null}
      {result ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-ink-950/50 p-4 text-xs text-mist-100">
          {result}
        </pre>
      ) : null}
    </div>
  );
}
