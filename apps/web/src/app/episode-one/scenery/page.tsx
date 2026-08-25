import Link from 'next/link';
import { compileEp001SceneryPullSheet } from '@/lib/tivvlejoy-ep001-scenery-pull-sheet';

export const metadata = {
  title: 'Episode 1 Scenery Pull Sheet | TivvleJoy',
  description: 'Read-only scenery and shot-assembly requirements for Meadow Map Mystery.',
};

const formatToken = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--color-surface)] p-4">
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-display text-xl font-bold text-[var(--color-text)]">{value}</dd>
    </div>
  );
}

export default function EpisodeOneSceneryPage() {
  const pullSheet = compileEp001SceneryPullSheet();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link
            href="/episode-one"
            className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]"
          >
            ← Episode 1 review
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Episode 1 scenery
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
                Shot-assembly pull sheet
              </h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
              Assets unresolved
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            The exact scenery, story-prop, camera, lighting, and composition requirements for all 10
            shots in {pullSheet.workingTitle}. This plans the pull only; it does not select or
            approve a purchased asset.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <MetricCard label="Locations" value={pullSheet.metrics.locationCount} />
          <MetricCard label="Shots" value={pullSheet.metrics.shotCount} />
          <MetricCard label="Required roles" value={pullSheet.metrics.uniqueRequiredRoleCount} />
          <MetricCard
            label="Base-set reuse"
            value={`${pullSheet.metrics.estimatedBaseReusePercent}%`}
          />
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Location pull
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Build three bases, reuse them across ten shots
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          Each base loads once. The remaining {pullSheet.metrics.reusedEnvironmentInstanceCount}{' '}
          shot environments reuse those bases with camera-aware dressing.
        </p>

        <div className="mt-5 space-y-4">
          {pullSheet.locations.map((location) => (
            <article
              key={location.locationId}
              className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-bold text-[var(--color-text-muted)]">
                    {location.locationId}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold text-[var(--color-text)]">
                    {formatToken(location.archetypeId)}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {location.shotIds.map((shotId) => shotId.replace('EP001_', '')).join(' · ')}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-[var(--color-text)]">
                  1 base · {location.reusedShotCount} reuse
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {location.requiredRoles.map((role) => (
                  <div
                    key={role.slotId}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-xs font-bold text-[var(--color-text)]">
                        {role.semanticRole}
                      </p>
                      <span className="text-xs font-bold text-[var(--color-primary)]">
                        {formatToken(role.qualityTier)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-[var(--color-text-muted)]">
                      {role.reason}
                    </p>
                    <p className="mt-2 text-xs font-bold text-[var(--color-warning-foreground)]">
                      {formatToken(role.providerRequirement)} · unresolved
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Shot pull
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Camera-aware requirements for every shot
        </h2>

        <ol className="mt-5 space-y-3">
          {pullSheet.shots.map((shot) => (
            <li key={shot.shotId}>
              <details className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-2">
                <summary className="min-h-touch cursor-pointer py-3">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-mono text-xs font-bold text-[var(--color-text-muted)]">
                        {shot.shotId}
                      </span>
                      <span className="ml-2 font-display text-base font-bold text-[var(--color-text)]">
                        {formatToken(shot.beat)}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-[var(--color-primary)]">
                      {formatToken(shot.locationId)} · {formatToken(shot.focalTarget)}
                    </span>
                  </span>
                </summary>

                <div className="space-y-4 border-t border-[var(--color-border)] py-4">
                  <p className="text-sm leading-6 text-[var(--color-text)]">{shot.storyPurpose}</p>
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    {[
                      [
                        'Camera',
                        `${formatToken(shot.cameraTemplateId)} · ${formatToken(shot.cameraMotion)}`,
                      ],
                      [
                        'Lighting',
                        `${formatToken(shot.lightingPresetId)} · ${formatToken(shot.lightingIntent)}`,
                      ],
                      [
                        'Set reuse',
                        shot.locationReuse.reusesBaseLocation
                          ? `Reuse from ${shot.locationReuse.firstLocationShotId}`
                          : 'First base load',
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                          {label}
                        </dt>
                        <dd className="mt-1 leading-5 text-[var(--color-text)]">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                      Scenery visibility
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {shot.roleVisibility.map((role) => (
                        <span
                          key={role.slotId}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            role.visibilityPriority === 'STORY_READABLE'
                              ? 'bg-[var(--color-highlight-soft)] text-[var(--color-highlight-foreground)]'
                              : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
                          }`}
                        >
                          {formatToken(role.semanticRole)} · {formatToken(role.visibilityPriority)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                      Story props
                    </p>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--color-text-muted)]">
                      {shot.storyProps.map((prop) => (
                        <li key={`${prop.propId}:${prop.state}`}>
                          <span className="font-mono font-bold text-[var(--color-text)]">
                            {prop.propId}
                          </span>{' '}
                          — {prop.state}; carrier {formatToken(prop.carrier)};{' '}
                          {formatToken(prop.visibility)} visibility.
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                      Composition protection
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
                      {shot.compositionProtections.map((protection) => (
                        <li key={protection}>{protection}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Acceptance gates
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Real bindings and visual review still required
            </h2>
          </div>
          <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
            0 / {pullSheet.qualityGates.length} complete
          </span>
        </div>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {pullSheet.qualityGates.map((gate) => (
            <li
              key={gate.id}
              className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-6 text-[var(--color-warning-foreground)]"
            >
              {gate.label}
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-2xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4">
          <p className="text-sm font-bold text-[var(--color-success-foreground)]">
            Planning only · no source download · no Blender · no paid compute · no Production write
          </p>
        </div>

        <p className="mt-5 text-xs leading-5 text-[var(--color-text-muted)]">
          Pull-sheet fingerprint:{' '}
          <code className="break-all font-mono text-[var(--color-text)]">
            {pullSheet.pullSheetSha256}
          </code>
        </p>
      </section>
    </main>
  );
}
