'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  buildPersistenceConsoleModel,
  createDirtyPersistenceState,
  createMemoryPersistenceStore,
  evaluatePersistenceHealth,
  exportWorkspaceBackup,
  importWorkspaceBackup,
  markSaved,
  markSaving,
  markUnsaved,
  persistSeasonToStore,
  shouldWarnBeforeUnload,
  type PersistenceConsoleModel,
  type SaveStatus,
} from '@/lib/tivvlejoy-production-persistence';
import type { ProductionConsoleModel } from '@/lib/tivvlejoy-production-studio/console-model';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[var(--color-background)]/60 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

export function ProductionStudioConsole({
  model,
  persistence,
}: {
  model: ProductionConsoleModel;
  persistence?: PersistenceConsoleModel;
}) {
  const [episodeId, setEpisodeId] = useState(model.episodes[0]?.episodeId ?? '');
  const [showTechnical, setShowTechnical] = useState(false);
  const [persistenceView, setPersistenceView] = useState<PersistenceConsoleModel | undefined>(persistence);
  const [dirty, setDirty] = useState(createDirtyPersistenceState());
  const [importText, setImportText] = useState('');
  const [importConfirm, setImportConfirm] = useState(false);
  const [operatorMessage, setOperatorMessage] = useState('Preview persistence is not Production durability.');

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldWarnBeforeUnload(dirty)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const refreshPersistence = () => {
    const nextDirty = markSaving(dirty);
    setDirty(nextDirty);
    const store = createMemoryPersistenceStore('ws_preview_control_room');
    const result = persistSeasonToStore(store);
    const accepted = result.receipts.every((receipt) => receipt.result === 'WRITE_ACCEPTED' || receipt.result === 'WRITE_IDEMPOTENT');
    setPersistenceView(buildPersistenceConsoleModel(store));
    setDirty(
      markSaved(nextDirty, {
        result: accepted ? 'WRITE_ACCEPTED' : 'WRITE_REJECTED',
        revision: store.getRevision(),
        dependencySha256: store.workspaceSha256(),
      }),
    );
    setOperatorMessage(accepted ? 'State refreshed from synthetic Preview fixtures. Not a Production database.' : 'Refresh failed.');
  };

  const validatePersistence = () => {
    const store = createMemoryPersistenceStore('ws_preview_control_room');
    persistSeasonToStore(store);
    const health = evaluatePersistenceHealth(store);
    setPersistenceView(buildPersistenceConsoleModel(store));
    setOperatorMessage(`Persistence health: ${health.health}. ${health.detail}`);
  };

  const exportBackup = () => {
    const store = createMemoryPersistenceStore('ws_preview_export');
    persistSeasonToStore(store);
    const backup = exportWorkspaceBackup(store);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tivvlejoy-production-backup.json';
    link.click();
    URL.revokeObjectURL(url);
    setOperatorMessage('Backup exported (metadata and hashes only). No commercial bytes.');
  };

  const importBackup = () => {
    if (!importConfirm) {
      setOperatorMessage('Import requires explicit confirmation.');
      return;
    }
    try {
      const parsed = JSON.parse(importText) as Parameters<typeof importWorkspaceBackup>[1];
      const store = createMemoryPersistenceStore(parsed.workspaceId ?? 'ws_preview_import');
      const result = importWorkspaceBackup(store, parsed, { confirm: true, expectedWorkspaceId: parsed.workspaceId });
      if (!result.ok) {
        setDirty(markUnsaved(dirty));
        setDirty({ ...markUnsaved(dirty), saveStatus: 'Save failed' as SaveStatus });
        setOperatorMessage(`Import rejected: ${result.reason}`);
        return;
      }
      setPersistenceView(buildPersistenceConsoleModel(store));
      setDirty(
        markSaved(dirty, {
          result: 'WRITE_ACCEPTED',
          revision: store.getRevision(),
          dependencySha256: store.workspaceSha256(),
        }),
      );
      setOperatorMessage('Import accepted after confirmation. Preview only.');
    } catch {
      setOperatorMessage('Import rejected: malformed backup JSON.');
    }
  };
  const episode = useMemo(
    () => model.episodes.find((item) => item.episodeId === episodeId) ?? model.episodes[0],
    [episodeId, model.episodes],
  );

  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Studio operator</p>
        <h1 className="font-display text-2xl font-semibold">Production control</h1>
        <p className="text-sm font-bold">PREVIEW / SYNTHETIC PRODUCTION DATA</p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">{model.note}</p>
        <p className="text-sm font-bold">Studio status: {model.studioReadinessLabel}</p>
        <p className="text-sm">Typical blocker: Waiting for Pip production rig. Nothing has been rendered.</p>
        <p className="text-sm">
          <Link href="/world-builder" className="font-bold underline">
            World Builder
          </Link>
          {' · '}
          <Link href="/world-builder/longevity" className="font-bold underline">
            Scenery longevity
          </Link>
          {' · '}
          <Link href="/shot-assembly" className="font-bold underline">
            Shot Assembly
          </Link>
          {' · '}
          <Link href="/animation-control" className="font-bold underline">
            Animation Control
          </Link>
        </p>
      </div>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Season health</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Episodes" value={model.seasonHealth.total} />
          <Stat label="Planning ready" value={model.seasonHealth.planningReady} />
          <Stat label="Blocked" value={model.seasonHealth.blocked} />
          <Stat label="Waiting assets" value={model.seasonHealth.waitingAssets} />
          <Stat label="Waiting rigs" value={model.seasonHealth.waitingRigs} />
          <Stat label="Waiting voices" value={model.seasonHealth.waitingVoices} />
          <Stat label="Waiting approval" value={model.seasonHealth.waitingApproval} />
          <Stat label="Render preflight ready" value={model.seasonHealth.renderPreflightReady} />
          <Stat label="QC ready" value={model.seasonHealth.qcReady} />
          <Stat label="Delivery ready" value={model.seasonHealth.deliveryReady} />
        </div>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Critical blockers</h2>
        {model.criticalBlockers.slice(0, 8).map((item) => (
          <p key={`${item.episodeId}:${item.label}:${item.detail}`} className="text-sm">
            {item.episodeId}: {item.label}
          </p>
        ))}
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Next safe actions</h2>
        {model.nextActions.slice(0, 8).map((item) => (
          <p key={`${item.episodeId}:${item.label}`} className="text-sm">
            {item.episodeId}: {item.label}
          </p>
        ))}
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Production batches</h2>
        {model.batches.slice(0, 8).map((batch) => (
          <p key={batch.batchId} className="break-all text-sm">
            {batch.jobType} · {batch.count} units{batch.blocked ? ' · waiting' : ''}
            {batch.reuse ? ` · ${batch.reuse}` : ''}
          </p>
        ))}
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Reuse opportunities</h2>
        {model.reuseOpportunities.length ? model.reuseOpportunities.map((item) => (
          <p key={item} className="text-sm">{item}</p>
        )) : <p className="text-sm">No shared-location reuse recorded in this preview slice.</p>}
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Continuity warnings</h2>
        {model.continuityWarnings.length ? model.continuityWarnings.map((item) => (
          <p key={`${item.episodeId}:${item.reason}`} className="text-sm">{item.episodeId}: {item.reason}</p>
        )) : <p className="text-sm">No continuity conflicts in the synthetic ledger snapshot.</p>}
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Scenery repetition risk</h2>
        {model.longevity ? (
          <>
            <p className="text-sm">Coverage: {model.longevity.coverage}</p>
            <p className="text-sm">Repetition risk: {model.longevity.risk}</p>
            <p className="text-sm">Confidence: {model.longevity.confidence}</p>
            <p className="text-sm">Purchase: {model.longevity.purchase}</p>
          </>
        ) : (
          <p className="text-sm">Longevity not evaluated.</p>
        )}
        {model.locationLoad.slice(0, 8).map((item) => (
          <p key={item.locationId} className="text-sm">{item.locationId}: {item.uses} shots</p>
        ))}
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Episode drill-down</h2>
        <label className="block text-sm">
          Episode
          <select
            className="mt-1 min-h-touch w-full rounded-xl border px-3 py-2"
            value={episode?.episodeId ?? ''}
            onChange={(event) => setEpisodeId(event.target.value)}
          >
            {model.episodes.map((item) => (
              <option key={item.episodeId} value={item.episodeId}>
                {item.episodeId} · {item.readinessLabel}
              </option>
            ))}
          </select>
        </label>
        {episode ? (
          <div className="space-y-2">
            <p className="text-sm font-bold">{episode.episodeId}: {episode.readinessLabel}</p>
            <p className="text-sm">Shots: {episode.shotCount}</p>
            <p className="text-sm">QC: {episode.qcPassed ? 'pass' : 'not ready'}</p>
            <p className="text-sm">Delivery: {episode.deliveryLabel}</p>
            <p className="text-sm">Waiting: {episode.waitingOn.join(' · ') || 'planning only'}</p>
            <details className="rounded-2xl bg-[var(--color-background)]/60 p-3">
              <summary className="min-h-touch cursor-pointer font-bold">Shot drill-down</summary>
              <div className="mt-2 space-y-2">
                {episode.shots.map((shot) => (
                  <p key={shot.shotId} className="text-sm">
                    {shot.shotId} · {shot.locationId} · {shot.stateLabel}
                  </p>
                ))}
              </div>
            </details>
          </div>
        ) : null}
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5" data-testid="persistence-panel">
        <h2 className="font-display text-xl font-semibold">Persistence</h2>
        <p className="text-sm font-bold">Save status: {dirty.saveStatus}</p>
        <p className="text-sm">Current persistence mode: {persistenceView?.mode ?? 'PREVIEW_MEMORY'}</p>
        <p className="text-sm">Durable: {persistenceView?.durable ?? 'NO'}</p>
        <p className="text-sm">Preview database: {persistenceView?.previewDatabase ?? 'NOT_CONNECTED'}</p>
        <p className="text-sm">Production database: NOT_CONNECTED</p>
        <p className="text-sm">Last successful save: {persistenceView?.lastSuccessfulSave ?? 'none'}</p>
        <p className="text-sm">Current workspace revision: {persistenceView?.workspaceRevision ?? 0}</p>
        <p className="break-all text-sm">Latest snapshot hash: {persistenceView?.latestSnapshotHash ?? 'none'}</p>
        <p className="text-sm">Journal event count: {persistenceView?.journalEventCount ?? 0}</p>
        <p className="text-sm">Pending write conflicts: {persistenceView?.pendingWriteConflicts ?? 0}</p>
        <p className="text-sm">Recovery status: {persistenceView?.recoveryStatus ?? 'LAST_VALID_REVISION_RECOVERABLE'}</p>
        <p className="text-sm">Backup available: {persistenceView?.backupAvailable ? 'YES' : 'NO'}</p>
        <p className="text-sm">Health: {persistenceView?.health ?? 'NOT_CONFIGURED'}</p>
        <p className="text-sm text-[var(--color-text-muted)]">{operatorMessage}</p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Browser Preview is not durable Production persistence. Database-ready does not mean database connected.
          Stored does not mean approved. Persisted does not mean rendered.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex min-h-touch items-center rounded-2xl bg-[var(--color-navigation)] px-4 text-sm font-bold text-[var(--color-navigation-text)]" onClick={exportBackup}>
            Export Backup
          </button>
          <button type="button" className="inline-flex min-h-touch items-center rounded-2xl border px-4 text-sm font-bold" onClick={refreshPersistence}>
            Refresh State
          </button>
          <button type="button" className="inline-flex min-h-touch items-center rounded-2xl border px-4 text-sm font-bold" onClick={validatePersistence}>
            Validate Persistence
          </button>
        </div>
        <label className="block text-sm">
          Import backup JSON
          <textarea
            className="mt-1 min-h-32 w-full rounded-xl border px-3 py-2 font-mono text-xs"
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setDirty(markUnsaved(dirty));
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={importConfirm} onChange={(event) => setImportConfirm(event.target.checked)} />
          I confirm this Preview import after reviewing hashes
        </label>
        <button type="button" className="inline-flex min-h-touch items-center rounded-2xl border px-4 text-sm font-bold" onClick={importBackup}>
          Import Backup
        </button>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Recovery status</h2>
        <p className="text-sm">Planned jobs: {model.recovery.jobCount}</p>
        <p className="text-sm">Paid render jobs waiting for authorization: {model.recovery.renderJobsRequireAuth}</p>
        <p className="text-sm">No GPU has been started. Duplicate UI retries will reuse an existing render receipt.</p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <button
          type="button"
          className="inline-flex min-h-touch items-center rounded-2xl bg-[var(--color-navigation)] px-4 text-sm font-bold text-[var(--color-navigation-text)]"
          onClick={() => setShowTechnical((value) => !value)}
        >
          {showTechnical ? 'Hide technical details' : 'Show technical details'}
        </button>
        {showTechnical ? (
          <div className="space-y-2 break-all text-xs">
            <p>Studio readiness code: {model.studioReadiness}</p>
            <p>Graph: {model.hashes.graphSha256}</p>
            <p>Orchestrator: {model.hashes.orchestratorSha256}</p>
            <p>Batch plan: {model.hashes.batchPlanSha256}</p>
            <p>Edges: {model.totals.edges} · facts: {model.totals.facts} · jobs: {model.totals.jobs}</p>
            {episode ? <p>Packet: {episode.packetSha256}</p> : null}
            {episode?.shots.slice(0, 3).map((shot) => (
              <p key={shot.shotId}>
                {shot.shotId} env {shot.environmentSha256} asm {shot.assemblySha256}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}
