import Link from 'next/link';
import { SCENERY_COPY } from '@/lib/scenery/copy';
import { hydratePreviewIntakeStoreSafely } from '@/lib/scenery/intake/hydrate-preview';
import { listArchiveContentExpectations, listExpectedSourceFiles } from '@/lib/scenery/intake/inventory';
import { publicIntakeSnapshot } from '@/lib/scenery/intake/readiness';
import { getSceneryIntakeStore } from '@/lib/scenery/intake/store';

export const dynamic = 'force-dynamic';

export default async function SceneryInspectionSummaryPage() {
  await hydratePreviewIntakeStoreSafely();
  const snapshot = publicIntakeSnapshot(getSceneryIntakeStore().listManifests());
  const readiness = snapshot.realAssetReadiness;
  const expected = listExpectedSourceFiles();
  const archive = listArchiveContentExpectations();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
        {SCENERY_COPY.previewOnly} / {SCENERY_COPY.noRender}
      </p>
      <h1 className="font-display text-3xl font-semibold">{SCENERY_COPY.inspectionSummaryTitle}</h1>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">{SCENERY_COPY.inspectionSummaryBody}</p>

      <section className="studio-card grid gap-3 p-4 sm:grid-cols-2">
        <Stat label={SCENERY_COPY.expectedFiles} value={readiness.expectedSourceDownloads} />
        <Stat label={SCENERY_COPY.uploadedFiles} value={readiness.uploadedFiles} />
        <Stat label={SCENERY_COPY.verifiedFiles} value={readiness.verifiedFiles} />
        <Stat label={SCENERY_COPY.missingFiles} value={readiness.missingFiles} />
        <Stat label={SCENERY_COPY.confirmedDuplicates} value={readiness.confirmedDuplicates} />
        <Stat label={SCENERY_COPY.quarantinedAssets} value={readiness.quarantinedFiles} />
      </section>

      <section className="studio-card space-y-2 p-4">
        <h2 className="font-bold">Safety confirmation</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Production modified: {String(readiness.productionModified)}</li>
          <li>Licensed files committed: {String(readiness.licensedFilesCommitted)}</li>
          <li>Secrets exposed: {String(readiness.secretsExposed)}</li>
          <li>Internal archive records ignored as downloads: {readiness.archiveContentRecordsIgnored}</li>
        </ul>
      </section>

      <section className="studio-card space-y-2 p-4">
        <h2 className="font-bold">Confirmed 14 source downloads</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {expected.map((item) => (
            <li key={item.sourceId}>
              {item.expectedFilename} · {item.collectionName} · {item.sourceId}
              {item.unityPreservationOnly ? ' · preservation only' : ''}
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card space-y-2 p-4">
        <h2 className="font-bold">Archive-content expectations</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          These {archive.length} names stay inside the 14 archives. They are not missing downloads.
        </p>
      </section>

      <p className="text-sm">
        <Link className="underline" href="/scenery">
          Back to scenery intake
        </Link>
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}
