import Link from 'next/link';
import { Ep001RigInspectionEvidenceUploader } from '@/components/preview/Ep001RigInspectionEvidenceUploader';
import { compileEp001RigInspectionEvidenceSlots } from '@/lib/tivvlejoy-ep001-rig-inspection-evidence';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Episode 1 Rig Inspection Evidence | TivvleJoy',
  description: 'Private, SHA-bound rig inspection evidence intake for Pip and Goat.',
};

export default function Ep001RigInspectionEvidenceInboxPage() {
  const contract = compileEp001RigInspectionEvidenceSlots();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card p-4 sm:p-6">
        <Link href="/episode-one/rig-delivery-upload" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Rig delivery upload</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 rig evidence</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Inspection evidence inbox</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">Upload the artist’s playblasts, turntables, deformation proof, and rig README after a corrected rig has a verified delivery receipt. Every evidence object is bound to the exact rig version ID and source SHA-256.</p>
        <dl className="mt-5 grid gap-px overflow-hidden rounded-2xl bg-[var(--color-border)] sm:grid-cols-4">
          {[['Required slots', contract.requiredCount], ['Pip slots', contract.pip.length], ['Goat slots', contract.goat.length], ['Auto approvals', 0]].map(([label, value]) => <div key={String(label)} className="bg-[var(--color-surface)] p-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>)}
        </dl>
        <p className="mt-4 break-all font-mono text-[11px] text-[var(--color-text-muted)]">Evidence contract SHA-256: {contract.contractSha256}</p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Ep001RigInspectionEvidenceUploader characterId="CHAR_PIP_001" slots={contract.pip} />
        <Ep001RigInspectionEvidenceUploader characterId="CHAR_GOAT_001" slots={contract.goat} />
      </div>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Required proof matrix</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-[var(--color-border)]"><th className="p-2">Character</th><th className="p-2">Evidence</th><th className="p-2">Why it exists</th><th className="p-2">Formats</th></tr></thead>
            <tbody>{contract.slots.map((slot) => <tr key={slot.id} className="border-b border-[var(--color-border)] align-top"><td className="p-2 font-bold">{slot.characterId === 'CHAR_PIP_001' ? 'Pip' : 'Goat'}</td><td className="p-2 font-mono text-xs">{slot.kind}</td><td className="p-2 text-[var(--color-text-muted)]">{slot.purpose}</td><td className="p-2 font-mono text-xs">{slot.acceptedExtensions.join(', ')}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">Evidence received does not mean rig approved.</p>
        <p className="mt-1">Technical inspection and human visual approval remain separate required gates before either character is admitted to Episode 1 production.</p>
      </section>
    </main>
  );
}
