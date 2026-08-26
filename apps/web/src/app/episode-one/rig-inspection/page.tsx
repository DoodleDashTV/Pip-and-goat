import Link from 'next/link';
import { compileEp001RigInspectionProtocol } from '@/lib/tivvlejoy-ep001-rig-inspection-protocol';

export const metadata = {
  title: 'Episode 1 Rig Inspection | TivvleJoy',
  description: 'Read-only Pip and Goat rig inspection protocol for Meadow Map Mystery.',
};

const formatToken = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

export default function EpisodeOneRigInspectionPage() {
  const protocol = compileEp001RigInspectionProtocol();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link
            href="/episode-one/rig-delivery"
            className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]"
          >
            ← Rig delivery contract
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Episode 1 rig admission
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
                Rig inspection protocol
              </h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
              Real rigs not present
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            The exact inspection path TivvleJoy will apply to Michael&apos;s Pip and Goat deliveries.
            There are 18 blocking checks in the master protocol. Passing technical checks still
            cannot issue human approval or unlock animation by itself.
          </p>
        </div>

        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Master checks
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
              {protocol.checks.length}
            </p>
          </div>
          <div className="bg-[var(--color-surface)] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Stages
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
              {protocol.stages.length}
            </p>
          </div>
          <div className="bg-[var(--color-surface)] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Pip checks
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
              {protocol.characters.find((character) => character.characterId === 'PIP')?.inspectionCheckCount}
            </p>
          </div>
          <div className="bg-[var(--color-surface)] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Goat checks
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
              {protocol.characters.find((character) => character.characterId === 'GOAT')?.inspectionCheckCount}
            </p>
          </div>
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Ordered gates
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Five-stage admission path
        </h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {protocol.stages.map((stage, index) => (
            <div
              key={stage.stage}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"
            >
              <p className="text-xs font-bold text-[var(--color-primary)]">Stage {index + 1}</p>
              <h3 className="mt-1 font-display text-lg font-bold text-[var(--color-text)]">
                {formatToken(stage.stage)}
              </h3>
              <p className="mt-2 text-sm font-semibold text-[var(--color-text-muted)]">
                {stage.checks.length} {stage.checks.length === 1 ? 'check' : 'checks'}
              </p>
              <p className="mt-3 text-xs leading-5 text-[var(--color-text-muted)]">
                {stage.mayAutoAdvance === false
                  ? 'Manual approval only'
                  : 'Evidence-bound technical progression'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Blocking checks
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Evidence required before rig admission
            </h2>
          </div>
          <p className="text-sm font-bold text-[var(--color-text-muted)]">All start pending</p>
        </div>

        <ol className="mt-5 space-y-3">
          {protocol.checks.map((check) => (
            <li
              key={check.checkId}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-bold text-[var(--color-primary)]">
                    {check.checkId} · {formatToken(check.stage)}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-bold text-[var(--color-text)]">
                    {check.label}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {check.appliesTo.map((characterId) => (
                    <span
                      key={characterId}
                      className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-[var(--color-text)]"
                    >
                      {characterId}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--color-text)]">
                {check.acceptanceCriterion}
              </p>
              <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
                Evidence: {check.evidenceKind}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Character coverage
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Required review depth
        </h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {protocol.characters.map((character) => (
            <article
              key={character.characterId}
              className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                    {character.characterId}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold text-[var(--color-text)]">
                    {character.displayName}
                  </h3>
                </div>
                <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
                  Waiting for real rig
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-bold text-[var(--color-text-muted)]">Checks</dt>
                  <dd className="mt-1 font-display text-xl font-bold">{character.inspectionCheckCount}</dd>
                </div>
                <div className="rounded-xl bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-bold text-[var(--color-text-muted)]">Controls</dt>
                  <dd className="mt-1 font-display text-xl font-bold">{character.requiredControlCount}</dd>
                </div>
                <div className="rounded-xl bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-bold text-[var(--color-text-muted)]">Poses</dt>
                  <dd className="mt-1 font-display text-xl font-bold">{character.requiredTestPoseCount}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Fail-closed rules
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Technical success is not approval
        </h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {protocol.executionRules.map((rule) => (
            <li
              key={rule}
              className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]"
            >
              {rule}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Protocol definition only</p>
        <p className="mt-1">
          Zero rig bytes · Blender not launched · zero network calls · zero paid requests · zero
          storage or Production mutations · no animation execution · no automatic approval
        </p>
        <p className="mt-3 break-all font-mono text-[11px]">
          Protocol sha256:{protocol.protocolSha256}
        </p>
      </section>
    </main>
  );
}
