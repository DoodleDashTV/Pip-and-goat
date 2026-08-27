import Link from 'next/link';
import { compileEp001AutonomousControlRoom } from '@/lib/tivvlejoy-ep001-autonomous-control-room';

export const metadata = {
  title: 'Episode 1 Control Room | TivvleJoy',
  description: 'Consolidated fail-closed EP001 autonomous readiness control room.',
};

export default function Ep001AutonomousControlRoomPage() {
  const room = compileEp001AutonomousControlRoom();

  const headlineRows = [
    ['Human decisions', room.headline.humanDecisionRows],
    ['Approvals issued', room.headline.humanApprovalsIssued],
    ['External triggers', room.headline.externalTriggers],
    ['Observed arrivals', room.headline.observedExternalTriggers],
    ['Safe actions queued', room.headline.safeActionsQueuedNow],
    ['Foundation inputs waiting', room.headline.foundationInputsWaiting],
    ['Synthetic scenarios', room.headline.syntheticScenariosCovered],
    ['Integrity issues', room.headline.crossContractIssueCount],
  ] as const;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/critical-path" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Critical path</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 consolidated control</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Autonomous control room</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">One deterministic view of human gates, external arrivals, synthetic handler coverage, critical-path inputs, cross-contract integrity, and contract hashes. Authority remains closed.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-4">
          {headlineRows.map(([label, value]) => (
            <div key={label} className="bg-[var(--color-surface)] p-4">
              <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Current state</p>
        <h2 className="mt-1 font-display text-2xl font-bold">{room.state}</h2>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">Cross-contract integrity: <span className="font-bold">{room.integrity.pass ? 'PASS' : 'FAIL'}</span></p>
        <p className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-muted)]">Integrity sha256: {room.integrity.crossContractIntegritySha256}</p>
        <h3 className="mt-5 font-bold">Parallel foundation inputs still required</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
          {room.nextRequiredExternalInputs.map((input) => (
            <li key={input.triggerId}><span className="font-bold">{input.triggerId}</span> · {input.subject}</li>
          ))}
        </ul>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Control surfaces</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {room.links.map((href) => (
            <Link key={href} href={href} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-sm font-bold text-[var(--color-primary)]">{href}</Link>
          ))}
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Current contract hashes</h2>
        <dl className="mt-4 space-y-3">
          {Object.entries(room.currentContracts).map(([label, hash]) => (
            <div key={label}>
              <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-muted)]">{hash}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">No real external foundation input has arrived.</p>
        <p className="mt-1">No provider calls · no Blender launch · no paid requests · no Production writes · no auto-approval.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Autonomous control room sha256: {room.autonomousControlRoomSha256}</p>
      </section>
    </main>
  );
}
