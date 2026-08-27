import Link from 'next/link';
import { Ep001HumanDecisionPreparer } from '@/components/preview/Ep001HumanDecisionPreparer';
import { Ep001LicenseEvidenceUploader } from '@/components/preview/Ep001LicenseEvidenceUploader';
import { Ep001PaidAuthorizationDraft } from '@/components/preview/Ep001PaidAuthorizationDraft';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';

export const metadata = {
  title: 'Episode 1 External Evidence Inbox | TivvleJoy',
  description: 'Private intake and preparation surface for EP001 external evidence and decisions.',
};

export default function Ep001ExternalEvidenceInboxPage() {
  const gates = compileEp001HumanGatePacket();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card p-4 sm:p-6">
        <Link href="/episode-one/control-room" className="text-sm font-bold text-[var(--color-primary)]">← Episode 1 control room</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">External input landing zone</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">External Evidence Inbox</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">A single place for the non-character evidence we know will arrive later. License files can be stored privately now; human decision receipts and spending metadata can be prepared against the exact current contracts without granting authority.</p>
        <div className="mt-4 rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]"><p className="font-bold">Evidence intake is not approval.</p><p>No panel on this page can auto-admit scenery, auto-record a human approval, contact a paid provider, launch GPU work, or write Production.</p></div>
      </section>

      <Ep001LicenseEvidenceUploader />
      <Ep001HumanDecisionPreparer rows={gates.rows.map((row) => ({ decisionId: row.decisionId, subjectLabel: row.subjectLabel }))} />
      <Ep001PaidAuthorizationDraft />

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Current manual decision inventory</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">{gates.metrics.totalDecisionRows} SHA-bound rows · {gates.metrics.approvedRows} approved · {gates.metrics.pendingRows} pending.</p>
        <p className="mt-3 break-all font-mono text-[11px] text-[var(--color-text-muted)]">Human gate packet SHA-256: {gates.humanGatePacketSha256}</p>
      </section>
    </main>
  );
}
