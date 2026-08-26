import Link from 'next/link';
import { compileEp001EvidenceAdmissionBoard } from '@/lib/tivvlejoy-ep001-evidence-admission';

export const metadata = {
  title: 'Episode 1 Evidence Admission | TivvleJoy',
  description:
    'Read-only evidence requirements and fail-closed admission preflight for Meadow Map Mystery.',
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

export default function EpisodeOneEvidencePage() {
  const board = compileEp001EvidenceAdmissionBoard();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link
            href="/episode-one/handoff"
            className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]"
          >
            ← Production handoff
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Episode 1 evidence control
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
                Evidence admission board
              </h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
              No evidence has been admitted yet
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            Exact requirements for the files and decisions still coming from Michael, asset review,
            voice production, human review, and final-render authorization. Metadata can be checked
            here, but only the separate manual gates can resolve a blocker.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <MetricCard label="Evidence classes" value={board.metrics.evidenceClassCount} />
          <MetricCard label="Not present" value={board.metrics.notPresentCount} />
          <MetricCard label="Candidates ready" value={board.metrics.candidateReadyCount} />
          <MetricCard label="Blockers resolved" value={board.metrics.resolvedBlockerCount} />
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Admission contracts
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Seven external evidence packages
            </h2>
          </div>
          <p className="text-sm font-bold text-[var(--color-text-muted)]">Manual gates only</p>
        </div>

        <ol className="mt-5 space-y-4">
          {board.rows.map((row, index) => (
            <li
              key={row.blockerCode}
              className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-bold text-[var(--color-warning-foreground)]">
                    Evidence {index + 1} · {row.blockerCode}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-bold text-[var(--color-text)]">
                    {row.label}
                  </h3>
                  <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">
                    {formatToken(row.evidenceClass)}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--color-warning)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-[var(--color-warning-foreground)]">
                  {formatToken(row.status)}
                </span>
              </div>

              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {row.requiredEvidence.map((requirement) => (
                  <li
                    key={requirement}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm leading-5 text-[var(--color-text)]"
                  >
                    {requirement}
                  </li>
                ))}
              </ul>
              <p className="mt-4 break-all font-mono text-xs leading-5 text-[var(--color-text-muted)]">
                Binds to sha256:{row.bindingTargetSha256}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Fail-closed rule
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Candidate-ready is not approved
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
          Even a packet with valid-looking hashes and complete counts resolves zero blockers. The
          original asset, receipt authenticity, reviewer decision, runtime expiry, and immutable
          worker identity must still pass their dedicated gates.
        </p>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Metadata validation only</p>
        <p className="mt-1">
          Zero source bytes · zero network calls · zero paid requests · zero storage or Production
          mutations · no automatic approval
        </p>
      </section>
    </main>
  );
}
