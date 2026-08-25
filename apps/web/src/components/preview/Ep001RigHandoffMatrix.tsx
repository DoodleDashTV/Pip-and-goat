import Link from 'next/link';
import type { Ep001RigHandoffMatrix as Ep001RigHandoffMatrixData } from '@/lib/tivvlejoy-ep001-rig-handoff';

type CharacterMatrix = Ep001RigHandoffMatrixData['characters'][number];

const formatToken = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

function CharacterRigCard({ character }: { character: CharacterMatrix }) {
  const requiredSource = character.sourceFiles.find((file) => file.required);
  const optionalSources = character.sourceFiles.filter((file) => !file.required);

  return (
    <article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">
            {character.displayName} rig
          </p>
          <h3 className="mt-1 font-display text-xl font-bold text-[var(--color-text)]">
            {character.uniqueActionCount} Episode 1 actions to support
          </h3>
        </div>
        <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
          Waiting for file
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
          Required delivery
        </p>
        <p className="mt-1 text-sm font-bold text-[var(--color-text)]">
          {requiredSource?.label ?? `${character.displayName} Blender source`}
        </p>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          {requiredSource?.reason}
        </p>
        <details className="mt-2">
          <summary className="min-h-touch cursor-pointer py-2 text-sm font-bold text-[var(--color-primary)]">
            Optional companion files
          </summary>
          <ul className="space-y-2 border-t border-[var(--color-border)] pt-3 text-sm leading-6 text-[var(--color-text-muted)]">
            {optionalSources.map((file) => (
              <li key={file.label}>
                <span className="font-bold text-[var(--color-text)]">{file.label}:</span>{' '}
                {file.reason}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="mt-4">
        <p className="text-sm font-bold text-[var(--color-text)]">Must-pass rig controls</p>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          {character.episodeRequiredCapabilityFamilies.length} capability families are exercised by
          this episode. The full admission set still applies.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {character.episodeRequiredControls.map((control) => (
            <span
              key={control.controlId}
              title={control.semanticPurpose}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-mono text-xs font-bold text-[var(--color-text)]"
            >
              {control.controlId}
            </span>
          ))}
        </div>
        {character.preferredEpisodeControls.length > 0 ? (
          <p className="mt-3 text-xs leading-5 text-[var(--color-text-muted)]">
            Preferred for this episode:{' '}
            <span className="font-mono font-bold text-[var(--color-text)]">
              {character.preferredEpisodeControls.map((control) => control.controlId).join(', ')}
            </span>
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-[var(--color-text-muted)]">
          Locked identity controls:{' '}
          <span className="font-mono font-bold text-[var(--color-text)]">
            {character.identityControls.map((control) => control.controlId).join(', ')}
          </span>
        </p>
        <details className="mt-2">
          <summary className="min-h-touch cursor-pointer py-2 text-sm font-bold text-[var(--color-primary)]">
            Full admission contract ({character.admissionRequiredControls.length} controls)
          </summary>
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
            {character.admissionRequiredControls.map((control) => (
              <span
                key={control.controlId}
                title={control.semanticPurpose}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-mono text-xs font-bold text-[var(--color-text)]"
              >
                {control.controlId}
              </span>
            ))}
          </div>
        </details>
      </div>

      <details className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <summary className="min-h-touch cursor-pointer py-3 text-sm font-bold text-[var(--color-text)]">
          Shot-by-shot action coverage
        </summary>
        <ol className="space-y-3 border-t border-[var(--color-border)] py-3">
          {character.actionCoverage.map((action) => (
            <li key={action.actionId} className="text-sm leading-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[var(--color-text)]">
                  {formatToken(action.actionId)}
                </span>
                <span className="font-mono text-xs text-[var(--color-text-muted)]">
                  {action.shotIds.map((shotId) => shotId.replace('EP001_', '')).join(' · ')}
                </span>
              </div>
              <p className="mt-1 text-[var(--color-text-muted)]">{action.acceptanceEvidence}</p>
              <p className="mt-1 font-mono text-xs text-[var(--color-primary)]">
                {action.requiredCapabilityFamilies.join(' · ')}
              </p>
            </li>
          ))}
        </ol>
      </details>

      <details className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <summary className="min-h-touch cursor-pointer py-3 text-sm font-bold text-[var(--color-text)]">
          Required test poses ({character.requiredTestPoses.length})
        </summary>
        <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] py-3">
          {character.requiredTestPoses.map((pose) => (
            <span
              key={pose}
              className="rounded-full bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold text-[var(--color-text)]"
            >
              {formatToken(pose)}
            </span>
          ))}
        </div>
      </details>
    </article>
  );
}

export function Ep001RigHandoffMatrix({ matrix }: { matrix: Ep001RigHandoffMatrixData }) {
  return (
    <section id="rig-handoff" className="studio-card scroll-mt-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Rig handoff
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
            Exactly what Michael needs to deliver
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">
            This checklist is derived from all 20 Pip and Goat performance plans in Episode 1. It
            receives and reviews files only; it cannot approve a rig or start animation.
          </p>
        </div>
        <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
          Both rigs pending
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {matrix.characters.map((character) => (
          <CharacterRigCard key={character.characterId} character={character} />
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
          <h3 className="font-display text-lg font-bold text-[var(--color-text)]">
            Delivery notes for Michael
          </h3>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-[var(--color-text-muted)]">
            {matrix.deliveryNotes.map((note, index) => (
              <li key={note} className="flex gap-3">
                <span className="font-bold text-[var(--color-primary)]">{index + 1}.</span>
                <span>{note}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4">
          <h3 className="font-display text-lg font-bold text-[var(--color-warning-foreground)]">
            Approval stays human
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-warning-foreground)]">
            All {matrix.acceptanceChecklist.length} arrival checks remain incomplete until the real
            files and deformation evidence are reviewed.
          </p>
          <p className="mt-2 text-sm font-bold text-[var(--color-warning-foreground)]">
            No auto-approval · no paid compute · no Production writes
          </p>
        </article>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[var(--color-text-muted)]">
          Matrix fingerprint:{' '}
          <code className="break-all font-mono text-[var(--color-text)]">
            {matrix.matrixSha256}
          </code>
        </p>
        <Link href="/rig-arrival" className="btn-primary shrink-0 px-4 text-sm">
          Open rig arrival
        </Link>
      </div>
    </section>
  );
}
