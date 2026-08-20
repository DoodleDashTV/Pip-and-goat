'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ControlRoomModel } from '@/lib/tivvlejoy-real-scenery-inspection/control-room';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[var(--color-background)]/60 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

export function SceneryInspectionControlRoom({ model }: { model: ControlRoomModel }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () =>
      model.sources.filter((row) => {
        const haystack = `${row.sourceId} ${row.displayName} ${row.format} ${row.inspectionState}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      }),
    [model.sources, query],
  );

  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Scenery inspection</p>
        <h1 className="font-display text-2xl font-semibold">Inspection control room</h1>
        <p className="text-sm font-bold">{model.banner}</p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          Evidence class: {model.evidenceClass}. Upload is not inspection. Inspection is not approval. Approved packages
          do not approve every child. Filenames never select production assets.
        </p>
        <p className="text-sm">
          <Link href="/production-control" className="font-bold underline">
            Production control
          </Link>
          {' · '}
          <Link href="/production-control/scenery" className="font-bold underline">
            Child review
          </Link>
          {' · '}
          <Link href="/world-builder" className="font-bold underline">
            World Builder
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Catalog sources" value={model.catalogSources} />
        <Stat label="Stored sources" value={model.storedSources} />
        <Stat label="Verified hashes" value={model.verifiedHashes} />
        <Stat label="Inspection-ready" value={model.inspectionReady} />
        <Stat label="Inspection-complete" value={model.inspectionComplete} />
        <Stat label="Deep inspection pending" value={model.deepInspectionPending} />
        <Stat label="Logical children" value={model.logicalChildrenDiscovered} />
        <Stat label="Ready for visual review" value={model.readyForVisualReview} />
        <Stat label="Approved" value={model.approved} />
        <Stat label="Blocked" value={model.blocked} />
        <Stat label="Archival" value={model.archival} />
      </div>

      <label className="studio-card block space-y-2 p-4 sm:p-5">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Filter</span>
        <input
          className="w-full rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2 text-base"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Source ID or display name"
        />
      </label>

      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.sourceId} className="studio-card space-y-1 p-4 sm:p-5">
            <p className="text-sm font-bold">{row.displayName}</p>
            <p className="text-sm">Source ID: {row.sourceId}</p>
            <p className="text-sm">Format: {row.format}</p>
            <p className="text-sm">Stored size: {row.storedSize ?? 'unknown'}</p>
            <p className="text-sm">Hash: {row.hashStatus}</p>
            <p className="text-sm">Inspection: {row.inspectionState}</p>
            <p className="text-sm">Dependencies: {row.dependencyStatus}</p>
            <p className="text-sm">Style: {row.styleState}</p>
            <p className="text-sm">Child candidates: {row.childCandidateCount}</p>
            <p className="text-sm">Blocker: {row.blocker ?? 'none'}</p>
            <p className="text-sm text-[var(--color-text-muted)]">{row.nextSafeAction}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
