import Link from 'next/link';
import { compileEp001RigDeliveryContract } from '@/lib/tivvlejoy-ep001-rig-delivery-contract';

export const metadata = {
  title: 'Episode 1 Rig Delivery | TivvleJoy',
  description: 'Exact read-only Pip and Goat artist rig delivery contract for Meadow Map Mystery.',
};

function formatToken(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export default function EpisodeOneRigDeliveryPage() {
  const contract = compileEp001RigDeliveryContract();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link
            href="/episode-one/evidence"
            className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]"
          >
            ← Evidence admission
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Episode 1 character handoff
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
                Artist rig delivery contract
              </h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
              Rigs not admitted
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            This is the exact package Pip and Goat need from the artist before TivvleJoy can inspect,
            deform-test, animate, or approve either character for Episode 1. It is a delivery contract,
            not an approval.
          </p>
        </div>

        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-3">
          {contract.intakePolicy.extensionLimits.map((limit) => (
            <div key={limit.extension} className="bg-[var(--color-surface)] p-4">
              <p className="font-mono text-sm font-bold text-[var(--color-text)]">{limit.extension}</p>
              <p className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
                {limit.maxMiB} MiB max
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
                {limit.canonical ? 'Canonical Blender source' : 'Optional companion export'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          File identity
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Canonical Blender source + immutable SHA-256
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            'One canonical .blend per character',
            'Filename never becomes identity',
            'Exact byte size is recorded',
            'SHA-256 becomes immutable artifact identity',
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-sm font-semibold leading-5 text-[var(--color-text)]"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      {contract.characters.map((character) => (
        <section key={character.characterId} className="studio-card p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                {character.characterId}
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
                {character.displayName} delivery requirements
              </h2>
            </div>
            <span className="rounded-full border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-1 text-xs font-bold text-[var(--color-warning-foreground)]">
              {formatToken(character.status)}
            </span>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--color-border)] p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                Required controls
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
                {character.requiredControlCount}
              </dd>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                Required test poses
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
                {character.requiredTestPoseCount}
              </dd>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                EP001 actions
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
                {character.episodeActionCount}
              </dd>
            </div>
          </dl>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="font-display text-lg font-bold text-[var(--color-text)]">
                Required controls
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {character.requiredControls.map((control) => (
                  <span
                    key={control.controlId}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 font-mono text-xs font-semibold text-[var(--color-text)]"
                  >
                    {control.controlId}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-display text-lg font-bold text-[var(--color-text)]">
                Required test poses
              </h3>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {character.requiredTestPoses.map((pose) => (
                  <li
                    key={pose}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2 text-sm font-semibold text-[var(--color-text)]"
                  >
                    {pose}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="font-display text-lg font-bold text-[var(--color-text)]">
              Deformation and acceptance evidence
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {character.requiredEvidence.map((evidence) => (
                <li
                  key={evidence}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-sm leading-5 text-[var(--color-text)]"
                >
                  {evidence}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Intake sequence
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          What happens when the files arrive
        </h2>
        <ol className="mt-4 space-y-3">
          {contract.operatorSequence.map((step, index) => (
            <li
              key={step}
              className="flex gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-sm leading-6 text-[var(--color-text)]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Automatic rejection conditions
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Delivery problems caught before approval
        </h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {contract.rejectionReasons.map((reason) => (
            <li
              key={reason}
              className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]"
            >
              {reason}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Read-only delivery contract</p>
        <p className="mt-1">
          Zero rig bytes · zero network calls · zero paid requests · zero storage or Production
          mutations · no animation execution · no automatic approval
        </p>
        <p className="mt-3 break-all font-mono text-[11px]">
          Contract sha256:{contract.contractSha256}
        </p>
      </section>
    </main>
  );
}
