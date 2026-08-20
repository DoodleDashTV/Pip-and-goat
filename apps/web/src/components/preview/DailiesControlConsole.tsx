'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { NightshiftConsoleModel } from '@/lib/tivvlejoy-nightshift-production/console-model';

export function DailiesControlConsole({ model }: { model: NightshiftConsoleModel }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => model.episodes.filter((row) => `${row.episodeId} ${row.intent}`.toLowerCase().includes(query.trim().toLowerCase())),
    [model.episodes, query],
  );
  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">TivvleJoy dailies</p>
        <h1 className="font-display text-2xl font-semibold">Dailies</h1>
        <p className="text-sm font-bold">{model.banner}</p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          Notes can request revisions. They cannot auto-approve a shot or mark TivvleJoy production-ready.
        </p>
        <p className="text-sm">Open notes: {model.review.open}. Human finals: {model.review.approved}.</p>
        <p className="text-sm">
          <Link href="/director-control" className="font-bold underline">
            Director control
          </Link>
        </p>
      </div>
      <label className="studio-card block space-y-2 p-4 sm:p-5" htmlFor="dailies-filter">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Filter episode, shot, or note</span>
        <input
          id="dailies-filter"
          name="dailies-filter"
          aria-label="Filter dailies by episode, shot, or note"
          className="min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2 text-base"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Episode ID"
        />
      </label>
      {rows.map((row) => (
        <article key={row.episodeId} className="studio-card space-y-1 p-4 sm:p-5">
          <p className="text-sm font-bold">{row.episodeId}</p>
          <p className="text-sm">Status: OPEN notes only. No auto approval.</p>
          <p className="text-sm text-[var(--color-text-muted)]">{row.intent}</p>
        </article>
      ))}
    </section>
  );
}
