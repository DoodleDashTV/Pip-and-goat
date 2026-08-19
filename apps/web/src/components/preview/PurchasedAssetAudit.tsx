'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import type { AssetAuditReport, DynamicAssetAudit, AuditIndicator } from '@/lib/purchased-tools/dynamic-audit';

const FILTERS = [
  'All',
  'Usable',
  'Awaiting inspection',
  'Missing',
  'Duplicates',
  'Blocked',
  'Scenery',
  'Tools',
  'Archival',
] as const;
type FilterName = (typeof FILTERS)[number];

const INDICATOR_CLASS: Record<AuditIndicator, string> = {
  GREEN: 'bg-[var(--color-success)]',
  YELLOW: 'bg-[var(--color-warning)]',
  GRAY: 'bg-[var(--color-text-muted)]',
  RED: 'bg-[var(--color-error)]',
};

function matchesFilter(item: AssetAuditReport, filter: FilterName): boolean {
  if (filter === 'All') return true;
  if (filter === 'Usable') return item.productionUsable;
  if (filter === 'Awaiting inspection') return item.inspectionState === 'AWAITING_INSPECTION';
  if (filter === 'Missing') return !item.stored && item.auditState !== 'UPLOAD_INCOMPLETE';
  if (filter === 'Duplicates') return item.duplicateState !== 'NONE';
  if (filter === 'Blocked') return item.auditState === 'BLOCKED' || item.blockers.length > 0;
  if (filter === 'Scenery') return item.role === 'asset-library';
  if (filter === 'Tools') return item.role === 'addon';
  return item.historical || item.auditState === 'ARCHIVAL_ONLY';
}

export function PurchasedAssetAudit() {
  const [token, setToken] = useState('');
  const [audit, setAudit] = useState<DynamicAssetAudit | null>(null);
  const [receiptsLoaded, setReceiptsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterName>('All');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/purchased-tools/audit', {
        headers: token.trim()
          ? { 'x-tivvlejoy-scenery-intake-token': token.trim() }
          : undefined,
      });
      const json = (await response.json()) as {
        audit?: DynamicAssetAudit;
        receiptsLoaded?: boolean;
        error?: string;
      };
      if (!json.audit) throw new Error(json.error ?? 'Audit did not return a result.');
      setAudit(json.audit);
      setReceiptsLoaded(Boolean(json.receiptsLoaded));
      if (json.error) setError(json.error);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Audit refresh failed.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const rows = useMemo(
    () => (audit ? [...audit.sources, ...audit.unknownReceipts].filter((item) => matchesFilter(item, filter)) : []),
    [audit, filter],
  );

  const counts = audit?.counts;

  return (
    <section className="space-y-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
          Preview only · read-only audit
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold">ASSET LIBRARY AUDIT</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          Reconciles every current catalog entry against private upload receipts. The total is
          whatever the catalog contains now. Uploaded is not usable. World Builder may consume only
          sources marked worldBuilderEligible.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/purchased-assets" className="font-bold underline">
            Back to iPhone upload
          </Link>
        </p>
      </div>

      <label className="block text-sm font-bold">
        TivvleJoy Preview studio upload token
        <input
          className="field-input mt-1 min-h-11 w-full"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>

      <button type="button" className="btn-primary min-h-11 px-4" disabled={busy} onClick={() => void refresh()}>
        {busy ? 'Refreshing…' : 'Refresh Audit'}
      </button>

      {error ? <p className="text-sm font-bold text-[var(--color-error)]">{error}</p> : null}
      {audit && !receiptsLoaded ? (
        <p className="text-sm text-[var(--color-warning-foreground)]">
          Catalog-only view. Paste the studio token and refresh to reconcile private receipts.
        </p>
      ) : null}

      {counts ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Total assets', counts.catalogAssetCount],
            ['Uploaded', counts.uploadedCount],
            ['Verified', counts.sizeVerifiedCount],
            ['Usable', counts.usableCount],
            ['Awaiting inspection', counts.inspectionPendingCount],
            ['Duplicates', counts.duplicateCount],
            ['Blocked', counts.blockedCount],
            ['Missing', counts.missingCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-[var(--color-border)] px-3 py-3">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">Tap Refresh Audit to load the current catalog.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((name) => (
          <button
            key={name}
            type="button"
            className={`min-h-10 rounded-full px-3 text-sm font-bold ${
              filter === name
                ? 'bg-[var(--color-navigation)] text-[var(--color-navigation-text)]'
                : 'border border-[var(--color-border)]'
            }`}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {rows.map((item) => (
          <li key={item.sourceId} className="rounded-2xl border border-[var(--color-border)] p-3">
            <div className="flex items-start gap-3">
              <span
                aria-label={item.indicator}
                className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full ${INDICATOR_CLASS[item.indicator]}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{item.displayName}</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {item.sourceId} · {item.originalFilename} · {item.auditState}
                </p>
                <p className="mt-1 text-sm">
                  {item.activation} · {item.role} · {item.format}
                  {item.worldBuilderEligible ? ' · World Builder eligible' : ' · not World Builder eligible'}
                  {item.productionUsable ? ' · usable' : ' · not production usable'}
                </p>
                {item.blockers.length ? (
                  <p className="mt-1 text-sm text-[var(--color-error)]">{item.blockers.join(' · ')}</p>
                ) : null}
                {item.warnings.length ? (
                  <p className="mt-1 text-sm text-[var(--color-warning-foreground)]">{item.warnings.join(' · ')}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
