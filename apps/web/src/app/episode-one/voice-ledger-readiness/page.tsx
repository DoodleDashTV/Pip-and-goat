import Link from 'next/link';
import { compileEp001VoiceDurableLedgerBridge } from '@/lib/tivvlejoy-ep001-voice-durable-ledger-bridge';

export const metadata = {
  title: 'Episode 1 Voice Ledger Readiness | TivvleJoy',
  description: 'Read-only durable receipt contract for the eight EP001 production voice lines.',
};

export default function Ep001VoiceLedgerReadinessPage() {
  const packet = compileEp001VoiceDurableLedgerBridge();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/voice-execution-readiness" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Voice execution readiness</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 voice persistence</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Durable voice ledger bridge</h1></div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Ledger ready · synthesis still external</span>
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">The proven durable voice receipt shape is now bound to all eight exact Episode 1 lines. No Episode 1 provider call or audio receipt is fabricated here.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <Metric label="EP001 rows" value={packet.metrics.lineCount} />
          <Metric label="Pip / Goat" value={`${packet.metrics.pipLineCount} / ${packet.metrics.goatLineCount}`} />
          <Metric label="Prior proven rows" value={packet.metrics.provenPriorExecutionRows} />
          <Metric label="EP001 executed" value={packet.metrics.executedLineCount} />
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Proven architecture</p>
        <p className="mt-3 text-sm leading-6">Observed prior durable executions: <b>{packet.provenLedgerArchitecture.observedSucceededExecutionCount}</b> succeeded, <b>{packet.provenLedgerArchitecture.observedStorageVerifiedCount}</b> storage-verified, and <b>{packet.provenLedgerArchitecture.observedAlignmentPresentCount}</b> with alignment evidence.</p>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">This proves the persistence architecture, not the eight Episode 1 performances.</p>
      </section>

      <section className="space-y-3">{packet.rows.map((row) => <article key={row.lineId} className="studio-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{row.lineId} · {row.speaker} · {row.shotId}</p><p className="mt-2 text-sm">Frames {row.pictureWindow.startFrame}–{row.pictureWindow.endFrame}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">{row.status}</span></div><p className="mt-3 break-all font-mono text-[11px]">Idempotency: {row.idempotencyKey}</p><p className="mt-2 break-all font-mono text-[11px]">Text SHA-256: {row.textSha256}</p><p className="mt-3 text-xs text-[var(--color-text-muted)]">audio SHA: absent · storage: unverified · alignment: absent · human approval: absent</p></article>)}</section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Durable Episode 1 receipt identities are ready</p>
        <p className="mt-1">Database reachable · provider architecture proven · current connected provider invoker unavailable · 0 paid calls</p>
        <p className="mt-3 break-all font-mono text-[11px]">Voice ledger bridge sha256: {packet.voiceDurableLedgerBridgeSha256}</p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p></div>;
}
