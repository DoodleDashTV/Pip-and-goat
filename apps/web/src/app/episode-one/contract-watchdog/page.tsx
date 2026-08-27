import Link from 'next/link';
import { compileCurrentEp001ContractSnapshot } from '@/lib/tivvlejoy-ep001-contract-watchdog';

export const metadata = {
  title: 'Episode 1 Contract Watchdog | TivvleJoy',
  description: 'Current SHA-bound EP001 contract snapshot for stale-evidence detection.',
};

export default function Ep001ContractWatchdogPage() {
  const snapshot = compileCurrentEp001ContractSnapshot();
  const rows = [
    ['Human gate packet', snapshot.humanGatePacketSha256],
    ['External arrival matrix', snapshot.externalArrivalTriggerMatrixSha256],
    ['Autonomous controller', snapshot.autonomousReadinessControllerSha256],
    ['Simulation audit', snapshot.simulationAuditSha256],
  ] as const;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card p-4 sm:p-6">
        <Link href="/episode-one/arrival-simulation" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Arrival simulation</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 stale-evidence protection</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Contract watchdog</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">These four hashes define the current intake and human-decision contract. Any drift invalidates affected stored receipts instead of silently migrating them.</p>
      </section>

      <section className="space-y-3">
        {rows.map(([label, hash]) => (
          <article key={label} className="studio-card p-4 sm:p-5">
            <p className="font-bold">{label}</p>
            <p className="mt-2 break-all font-mono text-[11px] text-[var(--color-text-muted)]">{hash}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">Hash drift never auto-migrates approval or authorization.</p>
        <p className="mt-1">No provider calls · no Blender launch · no paid requests · no Production writes · no auto-approval.</p>
      </section>
    </main>
  );
}
